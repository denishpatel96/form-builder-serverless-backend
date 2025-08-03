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
      const userData = Item ? unmarshall(Item) : null;
      if (!(userData && userData.role === "Owner")) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to delete the form inside this workspace.",
          }),
        };
      }
    }

    const deleteParams: DeleteItemCommandInput = {
      TableName: process.env.FORMS_TABLE,
      Key: marshall({ workspaceId, formId }),
    };
    console.log("Deleting form...");
    await db.send(new DeleteItemCommand(deleteParams));
    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ message: "Form deleted successfully!" }),
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
