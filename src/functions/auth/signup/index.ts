import {
  SignUpCommand,
  CognitoIdentityProviderClient,
  SignUpCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
  BatchWriteItemOutput,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
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

    // Add user in AWS Cognito.
    // Add generated userId in Database.

    const signupParams: SignUpCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
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

    const dateString = new Date().toISOString();

    // Make entries in db
    // 1. Create user
    // 2. Create default workspace
    const orgId = ulid();
    const workspaceId = ulid();
    const workspaceData = {
      pk: `u#${userId}`,
      sk: `w#${workspaceId}`,
      pk1: `w#${workspaceId}`,
      sk1: "A",
      type: "WS",
      name: "My Workspace",
      memberCount: 0,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      updatedAt: dateString,
    };

    const userData = {
      pk: `u#${userId}`,
      sk: "A",
      pk1: `o#${orgId}`,
      sk1: "A",
      type: "USER",
      firstName,
      lastName,
      email,
      // Org Name
      name: email.substr(0, email.indexOf("@")),
      memberCount: 0,
      workspaceCount: 1,
      formCount: 0,
      responseCount: 0,
      createdAt: dateString,
      updatedAt: dateString,
    };

    const params: BatchWriteItemCommandInput = {
      RequestItems: {
        [process.env.FORM_BUILDER_DATA_TABLE]: [
          {
            PutRequest: {
              Item: marshall(userData),
            },
          },
          {
            PutRequest: {
              Item: marshall(workspaceData),
            },
          },
        ],
      },
    };
    let response: BatchWriteItemOutput = await db.send(new BatchWriteItemCommand(params));

    // handle unprocessed item
    while (
      response &&
      response.UnprocessedItems &&
      Object.keys(response.UnprocessedItems).length > 0
    ) {
      let params: BatchWriteItemCommandInput = { RequestItems: response.UnprocessedItems };
      response = await db.send(new BatchWriteItemCommand(params));
    }

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({ email, id: userId }),
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
