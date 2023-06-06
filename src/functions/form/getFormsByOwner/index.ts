import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const ownerId = event.requestContext.authorizer?.claims.sub;
    const limit: number = event.queryStringParameters?.limit
      ? +event.queryStringParameters.limit
      : 100;

    const params: QueryCommandInput = {
      TableName: process.env.FORMS_TABLE,
      IndexName: "OwnerIdIndex",
      ExpressionAttributeValues: { ":v1": { S: ownerId } },
      KeyConditionExpression: "ownerId = :v1",
      Limit: limit,
    };

    const { Items } = await db.send(new QueryCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: Items?.map((i) => unmarshall(i)),
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      body: JSON.stringify({
        success: false,
        error: { name: e.name, message: e.message, stack: e.stack },
      }),
    };
  }
};
