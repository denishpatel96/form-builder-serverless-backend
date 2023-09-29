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
    const claimedEmail = event.requestContext.authorizer?.jwt.claims["email"];
    const { orgId, email } = event.queryStringParameters;
    if (!(orgId || email)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId or email required" }),
      };
    }

    if (email) {
      if (email !== claimedEmail) {
        return {
          statusCode: 403,
          ...corsHeaders,
          body: JSON.stringify({
            message: "You are not authorized to get invitations for this email.",
          }),
        };
      }

      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.ORG_MEMBER_INVITATIONS_TABLE,
          IndexName: "email-orgId-index",
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "email = :email",
          ExpressionAttributeValues: marshall({
            ":email": email,
          }),
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery(LastEvaluatedKey);
        }
      };

      await recursiveQuery();

      const invitations = items.map((i) => unmarshall(i));

      return {
        statusCode: 200,
        ...corsHeaders,
        body: JSON.stringify(invitations),
      };
    } else if (orgId) {
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
              message: "You are not authorized to get invited members list for this organization.",
            }),
          };
        }
      }
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.ORG_MEMBER_INVITATIONS_TABLE,
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

      const invitations = items.map((i) => unmarshall(i));

      return {
        statusCode: 200,
        ...corsHeaders,
        body: JSON.stringify(invitations),
      };
    }
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};
