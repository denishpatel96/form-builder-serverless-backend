import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { PostConfirmationTriggerHandler } from "aws-lambda";

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const db = new DynamoDBClient({ region: process.env.REGION });

  try {
    console.log("EVENT:", event);

    if (event.triggerSource === "PostConfirmation_ConfirmSignUp") {
      const { sub: userId } = event.request.userAttributes;

      // Make entry in db
      const dateString = new Date().toISOString();
      const userData = { emailVerified: true, updatedAt: dateString };
      const objKeys = Object.keys(userData);

      const updateUserParams: UpdateItemCommandInput = {
        TableName: process.env.USERS_TABLE,
        Key: marshall({ id: userId }),
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
    }
  } catch (e) {
    console.error(e);
  }
  return event;
};
