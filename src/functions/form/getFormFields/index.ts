import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  QueryCommand,
  QueryCommandInput,
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
    const { orgId, workspaceId, formId } = event.pathParameters;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceId && formId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId, workspaceId and formId are required" }),
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
      if (!Item) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to get the form of this workspace.",
          }),
        };
      }
    }

    // Get the form from database
    const { Item } = await db.send(
      new GetItemCommand({
        TableName: process.env.FORMS_TABLE,
        Key: marshall({
          workspaceId,
          formId,
        }),
      })
    );

    // If there is no such form in this workspace, return 403
    if (!Item) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({
          message: "There is no such form in this workspace.",
        }),
      };
    }

    // Get the form fields
    let fields: Record<string, AttributeValue>[] = [];
    const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
      const params: QueryCommandInput = {
        TableName: process.env.FORM_FIELDS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        KeyConditionExpression: "formId = :formId",
        ExpressionAttributeValues: marshall({
          ":formId": formId,
        }),
      };
      const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
      Items.forEach((i) => fields.push(unmarshall(i)));
      if (LastEvaluatedKey) {
        await recursiveQuery(LastEvaluatedKey);
      }
    };

    await recursiveQuery();

    const { lastFieldId, order } = unmarshall(Item);
    // convert order string to array by splitting by space
    const orderArray = order.split(" ");
    // sort fields in order
    fields.sort((a, b) => {
      return orderArray.indexOf(a.fieldId) - orderArray.indexOf(b.fieldId);
    });

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ content: { fields, lastFieldId, order: orderArray, formId, workspaceId } }),
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
