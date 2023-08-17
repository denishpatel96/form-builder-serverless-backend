import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  QueryCommandInput,
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
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];
    const { orgId } = event.pathParameters;
    if (!orgId) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId is required" }),
      };
    }

    let allowedWorkspaces: string[];
    if (orgId !== claimedUsername) {
      // Get Org Role
      const { Item } = await db.send(
        new GetItemCommand({
          TableName: process.env.ORGANIZATION_ROLES_TABLE,
          Key: marshall({
            orgId: orgId,
            userId: claimedUsername,
          }),
        })
      );

      if (Item) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "Only member can view workspaces for this organization.",
          }),
        };
      }

      const params: QueryCommandInput = {
        TableName: process.env.WORKSPACE_ROLES_TABLE,
        IndexName: "userId-workspaceId-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: marshall({
          ":userId": claimedUsername,
        }),
      };
      const { Items } = await db.send(new QueryCommand(params));
      allowedWorkspaces = Items.map((i) => unmarshall(i)).map((i) => i.workspaceId);
    }

    let items: Record<string, AttributeValue>[] = [];
    const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
      const params: QueryCommandInput = {
        TableName: process.env.WORKSPACES_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: marshall({
          ":orgId": orgId,
        }),
        ScanIndexForward: false,
      };
      const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
      Items.forEach((i) => items.push(i));
      if (LastEvaluatedKey) {
        await recursiveQuery(LastEvaluatedKey);
      }
    };

    await recursiveQuery();

    const workspaceData = items
      .map((i) => unmarshall(i))
      .filter((i) =>
        orgId !== claimedUsername ? allowedWorkspaces.includes(i.workspaceId) : true
      );
    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify(workspaceData),
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
