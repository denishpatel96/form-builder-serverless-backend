import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  formCount: number;
  responseCount: number;
  isDefault?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const claimedUserSub = event.requestContext.authorizer?.jwt.claims.sub;
    const { userSub } = event.pathParameters;
    // userId is same as orgId.
    if (!userSub) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "userSub is required" }),
      };
    }

    let allowedWorkspaces: string[];
    if (userSub !== claimedUserSub) {
      const params: QueryCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "pk1 = :pk1 and begins_with(sk1, :sk1)",
        ExpressionAttributeValues: marshall({
          ":pk1": `u#${claimedUserSub}`,
          ":sk1": `o#${userSub} w#`,
        }),
      };
      const { Items } = await db.send(new QueryCommand(params));
      if (Items.length === 0) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to get list of workspaces for this organization.",
          }),
        };
      }

      // pk = wsId
      allowedWorkspaces = Items.map((i) => unmarshall(i)).map((i) => i.pk);
    }

    let items: Record<string, AttributeValue>[] = [];
    const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
      const params: QueryCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        KeyConditionExpression: "pk = :pk and begins_with(sk, :sk)",
        ExpressionAttributeValues: marshall({
          ":pk": `o#${userSub}`,
          ":sk": "w#",
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

    const data = items.map((i) => unmarshall(i));
    const workspaceData: Workspace[] = data
      .map((i) => {
        return {
          id: i.sk.substring(2),
          name: i.name,
          createdAt: i.createdAt,
          updatedAt: i.updatedAt,
          memberCount: i.memberCount,
          formCount: i.formCount,
          responseCount: i.responseCount,
          isDefault: !!i.isDefault,
        };
      })
      .filter((i) => (userSub !== claimedUserSub ? allowedWorkspaces.includes(i.id) : true));
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
