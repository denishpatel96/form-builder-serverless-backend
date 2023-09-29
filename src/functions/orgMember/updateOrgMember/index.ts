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
    const { orgId, userId, role }: any = event.body ? JSON.parse(event.body) : {};
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && userId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId and userId required" }),
      };
    }

    if (claimedUsername !== orgId) {
      const params: GetItemCommandInput = {
        TableName: process.env.ORG_MEMBERS_TABLE,
        Key: marshall({
          orgId: orgId,
          userId: claimedUsername,
        }),
      };
      const { Item } = await db.send(new GetItemCommand(params));
      const userData = Item ? unmarshall(Item) : null;
      if (!(userData && userData.role === "Admin")) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to remove a member for this organization.",
          }),
        };
      }
    }

    const updateParams: UpdateItemCommandInput = {
      TableName: process.env.ORG_MEMBERS_TABLE,
      Key: marshall({ orgId, userId }),
      UpdateExpression: `SET #role = :role, #updatedAt = :updatedAt`,
      ExpressionAttributeNames: {
        "#role": "role",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: marshall({
        ":role": role,
        ":updatedAt": new Date().toISOString(),
      }),
    };
    console.log("Updating org member...");
    await db.send(new UpdateItemCommand(updateParams));
    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ message: "Org member updated successfully!" }),
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
