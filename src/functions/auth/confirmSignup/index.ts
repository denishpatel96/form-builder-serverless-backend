import {
  ConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { username, code } = body;
    if (!(username && code)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "username and verification code required" }),
      };
    }

    const params: ConfirmSignUpCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: username,
      ConfirmationCode: code,
    };
    await client.send(new ConfirmSignUpCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Account confirmed successfully!",
      }),
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
