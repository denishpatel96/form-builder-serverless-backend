import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });
import { ulid } from "ulid";
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
    const { orgId, workspaceId, formName } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceId && formName)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId, workspaceId and formName are required" }),
      };
    }

    const dateString = new Date().toISOString();
    const formId = ulid();
    const formData = {
      orgId: orgId,
      workspaceId: workspaceId,
      formId: formId,
      name: formName.substr(0, CHARACTER_LIMIT),
      responseCount: 0,
      createdAt: dateString,
      createdBy: claimedUsername,
      updatedAt: dateString,
    };

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
            message: "You are not authorized to create a form inside this workspace.",
          }),
        };
      }
    }

    await db.send(
      new PutItemCommand({
        TableName: process.env.FORMS_TABLE,
        Item: marshall(formData),
      })
    );

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Form created successfully!",
        formId: formData.formId,
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
