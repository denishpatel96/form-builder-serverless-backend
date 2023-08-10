import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
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
    const { username, ...updates }: any = event.body ? JSON.parse(event.body) : {};

    if (!(claimedUsername && username && claimedUsername === username)) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "You are not authorized to update other user's info." }),
      };
    }

    const dateString = new Date().toISOString();
    const userData = { ...updates, updatedAt: dateString };
    const objKeys = Object.keys(userData);
    const notAllowedAttributes = [
      "createdAt",
      "emailVerified",
      "memberCount",
      "formCount",
      "responseCount",
      "workspaceCount",
      "pk",
      "sk",
    ];
    const updateUserParams: UpdateItemCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      Key: marshall({ pk: `o#${username}`, sk: "A" }),
      UpdateExpression: `SET ${objKeys.map((key, index) =>
        notAllowedAttributes.includes(key) ? "" : `#key${index} = :value${index}`
      )}`,
      ExpressionAttributeNames: objKeys.reduce(
        (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
        {}
      ),
      ExpressionAttributeValues: marshall(
        objKeys.reduce(
          (acc, key, index) => ({
            ...acc,
            [`:value${index}`]: userData[key],
          }),
          {}
        )
      ),
    };
    await db.send(new UpdateItemCommand(updateUserParams));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify(userData),
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
