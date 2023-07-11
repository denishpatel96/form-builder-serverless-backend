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
    const { userSub, workspaceId } = event.pathParameters;
    const claimedUserSub = event.requestContext.authorizer?.claims.sub;

    if (!(userSub && workspaceId)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "organization id and workspace id are required" }),
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
            message: "You are not authorized to delete the workspace for this organization.",
          }),
        };
      }
    }

    const deleteParams: DeleteItemCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      Key: marshall({ pk: `o#${userSub}`, sk: `w#${workspaceId}` }),
      ConditionExpression: "attribute_not_exists(isDefault)",
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
