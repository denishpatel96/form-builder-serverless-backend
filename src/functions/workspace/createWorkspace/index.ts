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
    const { username, name } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(username && name)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "organization id and workspace name are required" }),
      };
    }

    const dateString = new Date().toISOString();
    const workspaceId = ulid();
    const workspaceData = {
      pk: `o#${username}`,
      sk: `w#${workspaceId}`,
      type: "WS",
      name: name.substr(0, CHARACTER_LIMIT),
      memberCount: claimedUsername !== username ? 1 : 0,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      createdBy: claimedUsername,
      updatedAt: dateString,
      bookmarked: false,
    };

    if (claimedUsername === username) {
      // Just add workspace
      const wsParams: PutItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Item: marshall(workspaceData),
      };

      await db.send(new PutItemCommand(wsParams));
    } else {
      const params: GetItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Key: marshall({
          pk: `o#${username}`,
          sk: `u#${claimedUsername}`,
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
        pk: `w#${workspaceId}`,
        sk: `u#${claimedUsername}`,
        pk1: `u#${claimedUsername}`,
        sk1: `o#${username} w#${workspaceId}`,
        type: "WS_MEM",
        role: "Owner",
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        createdAt: dateString,
        updatedAt: dateString,
      };

      const bwParams: BatchWriteItemCommandInput = {
        RequestItems: {
          [process.env.FORM_BUILDER_DATA_TABLE]: [
            {
              PutRequest: {
                Item: marshall(workspaceData),
              },
            },
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
        id: workspaceData.sk.substring(2),
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
