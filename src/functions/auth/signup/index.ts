import {
  SignUpCommand,
  CognitoIdentityProviderClient,
  SignUpCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand, PutItemCommandInput, QueryCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
import { ulid } from "ulid";

export const handler: APIGatewayProxyHandler = async (event) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };

  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { firstName, lastName, email, password } = body;
    if (!(firstName && lastName && email && password)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "first name, last name, email and password required" }),
      };
    }

    // Check whether user with email already exists or not.

    const { Items: users } = await db.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE,
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: marshall({
          ":email": email,
        }),
      })
    );

    if (users && users.length > 0) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "user with given email already exists" }),
      };
    }

    // Add user in AWS Cognito.
    // Add generated userId in Database.

    const userId = ulid();
    const signupParams: SignUpCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: userId,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "given_name", Value: firstName },
        { Name: "family_name", Value: lastName },
      ],
    };
    await client.send(new SignUpCommand(signupParams));

    const dateString = new Date().toISOString();

    // Make entries in db

    const userData = {
      userId,
      firstName,
      lastName,
      email,
      orgName: email.substr(0, email.indexOf("@")),
      memberCount: 0,
      workspaceCount: 0,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      updatedAt: dateString,
    };

    const params: PutItemCommandInput = {
      TableName: process.env.USERS_TABLE,
      Item: marshall(userData),
    };
    await db.send(new PutItemCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ content: { email, userId }, message: "Signed up successfully!" }),
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
