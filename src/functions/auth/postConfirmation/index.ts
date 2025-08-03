import * as fs from "fs";
import { PostConfirmationTriggerHandler } from "aws-lambda";
import { SES, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

export const handler: PostConfirmationTriggerHandler = async (event) => {
  try {
    let { email, given_name: firstName } = event.request.userAttributes;
    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/auth/postConfirmation/"
      : __dirname;

    if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
      // Send email
      let template = fs.readFileSync(dirPath + "accountConfirmedEmail.html", "utf8");

      const url = process.env.STAGE === "prod" ? "https://BrownLama.com/login" : "http://localhost:3000/login";
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$URL$", url);
      await sendEmail(email, "Account Confirmed Successfully", template);
    } else if (event.triggerSource === "PostConfirmation_ConfirmForgotPassword") {
      // Send email
      const url = process.env.STAGE === "prod" ? "https://BrownLama.com" : "http://localhost:3000";
      const link = url + `/forgotPassword?email=${email}`;
      let template = fs.readFileSync(dirPath + "passwordChangedEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$LINK$", link);
      await sendEmail(email, "Password Changed Successfully", template);
    }
  } catch (e) {
    console.error(e);
  }
  return event;
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
    Source: "BrownLama <denish@BrownLama.com>",
  };
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (err) {
    console.log(err);
  }
};
