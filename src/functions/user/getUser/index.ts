import { DynamoDBClient, GetItemCommand, GetItemCommandInput } from "@aws-sdk/client-dynamodb";
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

    if (!(claimedUsername && username && claimedUsername === username)) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "You are not authorized to fetch other user's info." }),
      };
    }

    const params: GetItemCommandInput = {
      TableName: process.env.USERS_TABLE,
      Key: marshall({
        userId: claimedUsername,
      }),
    };
    const { Item } = await db.send(new GetItemCommand(params));

    if (Item) {
      const userData = unmarshall(Item);
      return {
        statusCode: 200,
        ...corsHeaders,
        body: JSON.stringify({ content: userData }),
      };
    } else {
      return {
        statusCode: 404,
        ...corsHeaders,
        body: JSON.stringify({ message: "User not found." }),
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
