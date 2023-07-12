import * as fs from "fs";
import {
  ChangePasswordCommand,
  ChangePasswordCommandInput,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { SES, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const client = new CognitoIdentityProviderClient({ region: process.env.REGION });
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  const { email, given_name: firstName } = event.requestContext.authorizer?.jwt.claims;
  const dirPath = process.env.LAMBDA_TASK_ROOT
    ? process.env.LAMBDA_TASK_ROOT + "/dist/auth/changePassword/"
    : __dirname;

  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { accessToken, previousPassword, proposedPassword } = body;
    if (!(accessToken && previousPassword && proposedPassword)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({
          message: "accessToken, previousPassword and proposedPassword required",
        }),
      };
    }

    const params: ChangePasswordCommandInput = {
      AccessToken: accessToken,
      PreviousPassword: previousPassword,
      ProposedPassword: proposedPassword,
    };
    await client.send(new ChangePasswordCommand(params));

    // Send email
    const url = process.env.STAGE === "prod" ? "https://vtwinforms.com" : "http://localhost:3000";
    const link = url + `/forgotPassword?email=${email}`;
    let template = fs.readFileSync(dirPath + "passwordChangedEmail.html", "utf8");
    template = template.replace("$USER_NAME$", firstName);
    template = template.replace("$LINK$", link);
    await sendEmail(email, "Password Changed Successfully", template);

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Password changed successfully!",
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

const sendEmail = async (to: string, subject: string, body: string) => {
  const ses = new SES({ region: process.env.REGION });
  const params: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        Html: {
          Data: body,
          Charset: "UTF-8",
        },
      },
      Subject: {
        Data: subject,
      },
    },
    // Replace source_email with your SES validated email address
    Source: "vTwinForms <denish@vtwinforms.com>",
  };
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (err) {
    console.log(err);
  }
};
