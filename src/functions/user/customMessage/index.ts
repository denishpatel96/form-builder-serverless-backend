import * as fs from "fs";
import { CustomMessageTriggerHandler } from "aws-lambda";

export const handler: CustomMessageTriggerHandler = async (event) => {
  try {
    let { email, given_name: firstName } = event.request.userAttributes;
    const url = process.env.STAGE === "prod" ? "https://vtwinforms.com" : "http://localhost:3000";
    const code = event.request.codeParameter;
    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/user/customMessage/"
      : __dirname;

    if (
      event.triggerSource === "CustomMessage_SignUp" ||
      event.triggerSource === "CustomMessage_ResendCode"
    ) {
      const link = url + `/confirmSignup?code=${code}&email=${email}`;

      let template = fs.readFileSync(dirPath + "signupEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$USER_EMAIL$", email);
      template = template.replace("$LINK$", link);

      event.response = {
        smsMessage: `vTwinForms Account Verification Link: ${link}`,
        emailSubject: `${
          event.triggerSource === "CustomMessage_ResendCode" ? "Resent: " : ""
        }Confirm Your Account`,
        emailMessage: template,
      };
    } else if (event.triggerSource === "CustomMessage_ForgotPassword") {
      const link = url + `/confirmForgotPassword?code=${code}&email=${email}`;

      let template = fs.readFileSync(dirPath + "forgotPasswordEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$USER_EMAIL$", email);
      template = template.replace("$LINK$", link);

      event.response = {
        smsMessage: `vTwinForms Reset Password Link: ${link}`,
        emailSubject: `Reset Password`,
        emailMessage: template,
      };
    } else if (
      event.triggerSource === "CustomMessage_UpdateUserAttribute" ||
      event.triggerSource === "CustomMessage_VerifyUserAttribute"
    ) {
      const link = url + `/updateAttribute?code=${code}&email=${email}`;

      let template = fs.readFileSync(dirPath + "updateAttributeEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      template = template.replace("$USER_EMAIL$", email);

      event.response = {
        smsMessage: `vTwinForms Update Email Link: ${link}`,
        emailSubject: `Update Email`,
        emailMessage: template,
      };
    }
  } catch (e) {
    console.error(e);
  }

  return event;
};
