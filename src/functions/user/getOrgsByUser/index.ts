import {
  AttributeValue,
  DynamoDBClient,
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
    const { username } = event.pathParameters;

    // is this check necessary???
    if (!(claimedUsername && username && claimedUsername === username)) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "You are not authorized to fetch other user's info." }),
      };
    }

    let orgs: Record<string, AttributeValue>[] = [];
    const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
      const params: QueryCommandInput = {
        TableName: process.env.ORG_MEMBERS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
        IndexName: "userId-orgId-index",
        KeyConditionExpression: "userId = :userId",
        ExpressionAttributeValues: marshall({
          ":userId": username, // userId is same as orgId
        }),
      };
      const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
      Items.forEach((i) => orgs.push(unmarshall(i)));
      if (LastEvaluatedKey) {
        await recursiveQuery(LastEvaluatedKey);
      }
    };

    await recursiveQuery();

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify(orgs),
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
