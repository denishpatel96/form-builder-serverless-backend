import * as fs from "fs";
import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { PostConfirmationTriggerHandler } from "aws-lambda";
import { SES, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  console.log("EVENT : ", event);
  try {
    let { email, given_name: firstName } = event.request.userAttributes;
    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/auth/postConfirmation/"
      : __dirname;

    if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
      const { sub: userId } = event.request.userAttributes;

      // Make entry in db
      const dateString = new Date().toISOString();
      const userData = { emailVerified: true, updatedAt: dateString };
      const objKeys = Object.keys(userData);

      const updateUserParams: UpdateItemCommandInput = {
        TableName: process.env.FORM_BUILDER_DATA_TABLE,
        Key: marshall({ pk: `u#${userId}`, sk: "A" }),
        UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`)}`,
        ExpressionAttributeNames: objKeys.reduce(
          (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
          {}
        ),
        ExpressionAttributeValues: marshall(
          objKeys.reduce(
            (acc, key, index) => ({
              ...acc,
              [`:value${index}`]: userData[key],
            }),
            {}
          )
        ),
      };
      await db.send(new UpdateItemCommand(updateUserParams));

      // Send email
      let template = fs.readFileSync(dirPath + "accountConfirmedEmail.html", "utf8");
      template = template.replace("$USER_NAME$", firstName);
      await sendEmail(email, "Account Confirmed Successfully", template);
    } else if (event.triggerSource === "PostConfirmation_ConfirmForgotPassword") {
      // Send email
      const url = process.env.STAGE === "prod" ? "https://vtwinforms.com" : "http://localhost:3000";
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
    Source: "vTwinForms <denish@vtwinforms.com>",
  };
  try {
    await ses.send(new SendEmailCommand(params));
  } catch (err) {
    console.log(err);
  }
};
