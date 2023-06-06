import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmForgotPasswordCommandInput,
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
    const { email, code, password } = body;
    if (!(email && code && password)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({
          success: false,
          error: { message: "email, code and password required" },
        }),
      };
    }

    const params: ConfirmForgotPasswordCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: password,
    };
    await client.send(new ConfirmForgotPasswordCommand(params));

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        success: true,
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({
        success: false,
        error: { name: e.name, message: e.message, stack: e.stack },
      }),
    };
  }
};
