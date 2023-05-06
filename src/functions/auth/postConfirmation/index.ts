import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";

export const handler: APIGatewayProxyHandler = async (event) => {
  const db = new DynamoDBClient({ region: process.env.REGION });

  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { userSub: userId } = body;
    console.log("body", body);

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

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Successfully updated user email verification status",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "[Internal Server Error] Failed to update email verification status",
        error: { message: e.message, stack: e.stack },
      }),
    };
  }
};
