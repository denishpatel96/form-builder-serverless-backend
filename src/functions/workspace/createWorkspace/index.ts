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

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { userSub, name } = body;
    const claimedUserSub = event.requestContext.authorizer?.jwt.claims.sub;

    if (!(userSub && name)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "organization id and workspace name are required" }),
      };
    }

    const dateString = new Date().toISOString();
    const workspaceId = ulid();
    const workspaceData = {
      pk: `o#${userSub}`,
      sk: `w#${workspaceId}`,
      type: "WS",
      name: name,
      memberCount: claimedUserSub !== userSub ? 1 : 0,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      updatedAt: dateString,
    };

    if (claimedUserSub === userSub) {
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
          pk: `o#${userSub}`,
          sk: `u#${claimedUserSub}`,
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
        sk: `u#${claimedUserSub}`,
        pk1: `u#${claimedUserSub}`,
        sk1: `o#${userSub} w#${workspaceId}`,
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
        id: workspaceData.sk.substring(2),
        name: workspaceData.name,
        updatedAt: workspaceData.updatedAt,
        createdAt: workspaceData.createdAt,
        formCount: workspaceData.formCount,
        memberCount: workspaceData.memberCount,
        responsesCount: workspaceData.responseCount,
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
