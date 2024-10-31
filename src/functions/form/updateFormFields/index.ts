import {
  BatchWriteItemCommand,
  BatchWriteItemOutput,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { orgId, workspaceId, formId, action, order, fields, lastFieldId, fieldIds } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceId && formId && action)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId, workspaceId, formId and action are required" }),
      };
    }

    if (claimedUsername !== orgId) {
      const params: GetItemCommandInput = {
        TableName: process.env.WORKSPACE_MEMBERS_TABLE,
        Key: marshall({
          workspaceId: workspaceId,
          userId: claimedUsername,
        }),
      };
      const { Item } = await db.send(new GetItemCommand(params));
      const userData = Item ? unmarshall(Item) : null;
      if (!(userData && userData.role === "Owner" && userData.role === "Admin")) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to update the form fields.",
          }),
        };
      }
    }

    // =============== ADD FIELDS ===============
    if (action === "ADD_FIELDS") {
      if (!(lastFieldId && lastFieldId > 0 && order && order.length > 0 && fields && fields.length > 0)) {
        return {
          statusCode: 400,
          ...corsHeaders,
          body: JSON.stringify({
            message:
              "lastFieldId (>0), order (with at least 1 element) and fields (with at least 1 element) are required",
          }),
        };
      }

      // add new fields to form fields table
      let response: BatchWriteItemOutput = await db.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [process.env.FORM_FIELDS_TABLE]: fields.map((field: any) => ({
              PutRequest: {
                Item: marshall({ formId, ...field }),
              },
            })),
          },
        })
      );

      // handle unprocessed item
      while (response && response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
        response = await db.send(new BatchWriteItemCommand({ RequestItems: response.UnprocessedItems }));
      }
    }
    // =============== DELETE FIELDS ===============
    else if (action === "DELETE_FIELDS") {
      if (!(order && fieldIds && fieldIds.length > 0)) {
        return {
          statusCode: 400,
          ...corsHeaders,
          body: JSON.stringify({
            message: "order and fieldIds ( with at least 1 element) are required",
          }),
        };
      }

      // delete fields from form fields table
      await db.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [process.env.FORM_FIELDS_TABLE]: fieldIds.map((fieldId: any) => ({
              DeleteRequest: {
                Key: marshall({ fieldId, formId }),
              },
            })),
          },
        })
      );
    }
    // =============== UPDATE FIELDS ===============
    else if (action === "UPDATE_FIELDS") {
      if (!(fields && fields.length > 0)) {
        return {
          statusCode: 400,
          ...corsHeaders,
          body: JSON.stringify({
            message: "fields ( with at least 1 element) are required",
          }),
        };
      }

      // update fields in form fields table
      let response: BatchWriteItemOutput = await db.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [process.env.FORM_FIELDS_TABLE]: fields.map((field: any) => ({
              PutRequest: {
                Item: marshall({ formId, ...field }),
              },
            })),
          },
        })
      );

      // handle unprocessed item
      while (response && response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
        response = await db.send(new BatchWriteItemCommand({ RequestItems: response.UnprocessedItems }));
      }
    }

    // convert order array to string with space as delimiter
    const newOrder = order.join(" ");
    const updatedAt = new Date().toISOString();
    await db.send(
      new UpdateItemCommand({
        TableName: process.env.FORMS_TABLE,
        Key: marshall({ formId: formId, workspaceId: workspaceId }),
        UpdateExpression: `SET 
        ${action === "ADD_FIELDS" ? "#lastFieldId = :lastFieldId, " : ""} 
        ${action !== "UPDATE_FIELDS" ? "#order = :order, " : ""}
        #updatedAt = :updatedAt`,
        ExpressionAttributeNames:
          action === "ADD_FIELDS"
            ? { $lastFieldId: "lastFieldId", "#order": "order", "#updatedAt": "updatedAt" }
            : action === "UPDATE_FIELDS"
            ? { "#updatedAt": "updatedAt" }
            : { "#order": "order", "#updatedAt": "updatedAt" },
        ExpressionAttributeValues: marshall(
          action === "ADD_FIELDS"
            ? { ":lastFieldId": lastFieldId, ":order": newOrder, ":updatedAt": updatedAt }
            : action === "UPDATE_FIELDS"
            ? { ":updatedAt": updatedAt }
            : { ":order": newOrder, ":updatedAt": updatedAt }
        ),
      })
    );

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: `form fields ${
          action === "UPDATE_FIELDS"
            ? "updated"
            : action === "DELETE_FIELDS"
            ? "deleted"
            : action === "ADD_FIELDS"
            ? "added"
            : "reordered"
        } successfully`,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};
