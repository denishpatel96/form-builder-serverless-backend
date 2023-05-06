import {
  ConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommandInput,
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });

  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { email, code } = body;
    if (!(email && code)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "[Bad Request] email and verification code required",
        }),
      };
    }

    const params: ConfirmSignUpCommandInput = {
      ClientId: process.env.USER_POOL_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    };
    await client.send(new ConfirmSignUpCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully confirmed user email",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to confirm user email",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
