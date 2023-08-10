import {
  DeleteItemCommand,
  DeleteItemCommandInput,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
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
    const { username, workspaceId } = event.pathParameters;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(username && workspaceId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "organization id and workspace id are required" }),
      };
    }

    if (claimedUsername !== username) {
      const params: GetItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Key: marshall({
          pk: `w#${workspaceId}`,
          sk: `u#${claimedUsername}`,
        }),
      };
      const { Item } = await db.send(new GetItemCommand(params));
      const userData = Item ? unmarshall(Item) : null;
      if (!(userData && userData.role === "Owner")) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to delete the workspace for this organization.",
          }),
        };
      }
    }

    const deleteParams: DeleteItemCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      Key: marshall({ pk: `o#${username}`, sk: `w#${workspaceId}` }),
    };
    console.log("Deleting workspace...");
    await db.send(new DeleteItemCommand(deleteParams));
    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ message: "Workspace deleted successfully!" }),
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
