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
    const { orgId, workspaceId, ...updates } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId and workspaceId are required" }),
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
      if (!(userData && userData.role === "Owner")) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to update the workspace for this organization.",
          }),
        };
      }
    }

    const workspaceData = { ...updates, updatedAt: new Date().toISOString() };
    const objKeys = Object.keys(workspaceData);
    const notAllowedAttributes = [
      "orgId",
      "workspaceId",
      "createdAt",
      "memberCount",
      "formCount",
      "responseCount",
      "createdBy",
    ];

    const updateParams: UpdateItemCommandInput = {
      TableName: process.env.WORKSPACES_TABLE,
      Key: marshall({ orgId: orgId, workspaceId: workspaceId }),
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
            [`:value${index}`]: workspaceData[key],
          }),
          {}
        )
      ),
    };
    await db.send(new UpdateItemCommand(updateParams));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ message: "workspace updated successfully" }),
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
