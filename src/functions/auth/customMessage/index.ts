import * as fs from "fs";
import { CustomMessageTriggerHandler } from "aws-lambda";

export const handler: CustomMessageTriggerHandler = async (event) => {
  try {
    console.log("EVENT:", event);
    let { email, given_name: firstName } = event.request.userAttributes;

    if (event.triggerSource === "CustomMessage_SignUp") {
      const code = event.request.codeParameter;
      const url = process.env.STAGE === "prod" ? "https://vtwinforms.com" : "http://localhost:3000";
      const link = url + `/verify-email?code=${code}&email=${email}`;
      const dirPath = process.env.LAMBDA_TASK_ROOT
        ? process.env.LAMBDA_TASK_ROOT + "/dist/auth/customMessage/"
        : __dirname;
      let template = fs.readFileSync(dirPath + "signupEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$USER_EMAIL$", email);
      template = template.replace("$LINK$", link);

      event.response = {
        smsMessage: `vTwin Forms Account Verification Link: ${link}`,
        emailSubject: `Confirm Your Account & Get Started`,
        emailMessage: template,
      };
    }
  } catch (e) {
    console.error(e);
  }

  console.log("Email Sent");
  return event;
};
