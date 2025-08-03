import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });
const CHARACTER_LIMIT = 60;

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { orgId, workspaceId, formId, ...updates } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceId && formId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId, workspaceId and formId are required" }),
      };
    }

    if (updates.name && updates.name.length > CHARACTER_LIMIT) {
      updates.name = updates.name.substr(0, CHARACTER_LIMIT);
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
            message: "You are not authorized to update the form.",
          }),
        };
      }
    }

    const formData = { ...updates, updatedAt: new Date().toISOString() };
    const objKeys = Object.keys(formData);
    const notAllowedAttributes = [
      "orgId",
      "workspaceId",
      "formId",
      "createdAt",
      "responseCount",
      "createdBy",
    ];

    const updateParams: UpdateItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ formId: formId, workspaceId: workspaceId }),
      UpdateExpression: `SET ${objKeys.map((key, index) =>
        notAllowedAttributes.includes(key) ? "" : `#key${index} = :value${index}`
      )}`,
      ExpressionAttributeNames: objKeys.reduce(
        (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        objKeys.reduce(
          (acc, key, index) => ({
            ...acc,
            [`:value${index}`]: formData[key],
          }),
          {}
        )
      ),
    };
    await db.send(new UpdateItemCommand(updateParams));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ message: "form updated successfully" }),
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
