import {
  SignUpCommand,
  CognitoIdentityProviderClient,
  SignUpCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });

  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { firstName, lastName, role, ownerId, email, password } = body;
    if (!(firstName && lastName && email && password)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message:
            "[Bad Request] Missing one or more from : first name, last name, email, password",
        }),
      };
    }

    const signupParams: SignUpCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      ClientMetadata: { firstName, lastName, role, ownerId },
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "given_name", Value: firstName },
        { Name: "family_name", Value: lastName },
      ],
    };
    const signupResponse = await client.send(new SignUpCommand(signupParams));
    const userId = signupResponse.UserSub;

    // Make entry in db
    const dateString = new Date().toISOString();
    const userData = {
      firstName,
      lastName,
      role: role,
      ownerId: ownerId,
      email,
      id: userId,
      emailVerified: false,
      createdAt: dateString,
      updatedAt: dateString,
    };

    const createUserParams: PutItemCommandInput = {
      TableName: process.env.USERS_TABLE,
      Item: marshall(userData),
    };
    await db.send(new PutItemCommand(createUserParams));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully registered user",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to register user",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
