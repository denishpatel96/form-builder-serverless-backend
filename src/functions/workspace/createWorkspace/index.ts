import {
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  BatchWriteItemOutput,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
  PutItemCommand,
  PutItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
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
    const { orgId, workspaceName } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && workspaceName)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId and workspaceName are required" }),
      };
    }

    const dateString = new Date().toISOString();
    const workspaceId = ulid();
    const workspaceData = {
      orgId: orgId,
      workspaceId: workspaceId,
      name: workspaceName.substr(0, CHARACTER_LIMIT),
      memberCount: claimedUsername !== orgId ? 2 : 1,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      createdBy: claimedUsername,
      updatedAt: dateString,
      bookmarked: false,
    };

    if (claimedUsername === orgId) {
      // Just add workspace
      const wsParams: PutItemCommandInput = {
        TableName: process.env.WORKSPACES_TABLE,
        Item: marshall(workspaceData),
      };

      await db.send(new PutItemCommand(wsParams));
    } else {
      const params: GetItemCommandInput = {
        TableName: process.env.ORG_MEMBERS_TABLE,
        Key: marshall({
          orgId: orgId,
          userId: claimedUsername,
        }),
      };
      const { Item } = await db.send(new GetItemCommand(params));
      const userData = Item ? unmarshall(Item) : null;
      if (!(userData && (userData.role === "Editor" || userData.role === "Admin"))) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to create a workspace for this organization.",
          }),
        };
      }

      const wsMemberData = {
        workspaceId: workspaceId,
        userId: claimedUsername,
        role: "Owner",
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        createdAt: dateString,
        updatedAt: dateString,
        createdBy: claimedUsername,
      };

      const bwParams: BatchWriteItemCommandInput = {
        RequestItems: {
          [process.env.WORKSPACES_TABLE]: [
            {
              PutRequest: {
                Item: marshall(workspaceData),
              },
            },
          ],
          [process.env.WORKSPACE_MEMBERS_TABLE]: [
            {
              PutRequest: {
                Item: marshall(wsMemberData),
              },
            },
          ],
        },
      };
      let response: BatchWriteItemOutput = await db.send(new BatchWriteItemCommand(bwParams));

      // handle unprocessed item
      while (
        response &&
        response.UnprocessedItems &&
        Object.keys(response.UnprocessedItems).length > 0
      ) {
        let params: BatchWriteItemCommandInput = { RequestItems: response.UnprocessedItems };
        response = await db.send(new BatchWriteItemCommand(params));
      }
    }

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Workspace created successfully!",
        workspaceId: workspaceData.workspaceId,
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
