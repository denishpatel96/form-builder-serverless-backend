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

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { userSub, workspaceId, name } = body;
    const claimedUserSub = event.requestContext.authorizer?.claims.sub;

    if (!(userSub && workspaceId && name)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "userSub and workspaceId and name are required" }),
      };
    }

    if (claimedUserSub !== userSub) {
      const params: GetItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Key: marshall({
          pk: `w#${workspaceId}`,
          sk: `u#${claimedUserSub}`,
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

    const updateParams: UpdateItemCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      Key: marshall({ pk: `o#${userSub}`, sk: `w#${workspaceId}` }),
      UpdateExpression: `SET name = :name and updatedAt = :updatedAt`,
      ExpressionAttributeValues: marshall({
        ":name": name,
        ":updatedAt": new Date().toISOString(),
      }),
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
