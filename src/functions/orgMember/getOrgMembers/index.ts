import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
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
    // userId is same as orgId.
    if (!orgId) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId is required" }),
      };
    }

    if (orgId !== claimedUsername) {
      const params: GetItemCommandInput = {
        TableName: process.env.ORG_MEMBERS_TABLE,
        Key: marshall({
          orgId: orgId,
          userId: claimedUsername,
        }),
      };
      const { Item } = await db.send(new GetItemCommand(params));
      if (!Item) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to get members for this organization.",
          }),
        };
      }
    }

    let items: Record<string, AttributeValue>[] = [];
    const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
      const params: QueryCommandInput = {
        TableName: process.env.ORG_MEMBERS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        KeyConditionExpression: "orgId = :orgId",
        ExpressionAttributeValues: marshall({
          ":orgId": orgId,
        }),
      };
      const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
      Items.forEach((i) => items.push(i));
      if (LastEvaluatedKey) {
        await recursiveQuery(LastEvaluatedKey);
      }
    };

    await recursiveQuery();

    const orgMembers = items.map((i) => unmarshall(i));
    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify(orgMembers),
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
