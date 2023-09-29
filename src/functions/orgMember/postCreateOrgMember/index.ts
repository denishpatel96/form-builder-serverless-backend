import {
  DynamoDBClient,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });
  for (let record of event.Records) {
    console.log("Stream record: ", JSON.stringify(record, null, 2));

    // if new member is added, then:
    // increment count of member,
    const orgId = record.dynamodb.NewImage.orgId.S;
    const params: UpdateItemCommandInput = {
      TableName: process.env.USERS_TABLE,
      Key: marshall({ userId: orgId }),
      UpdateExpression: `SET memberCount = if_not_exists(memberCount, :start) + :inc`,
      ExpressionAttributeValues: marshall({
        ":inc": 1,
        ":start": 0,
      }),
    };

    console.log("Updating members count...");
    try {
      await db.send(new UpdateItemCommand(params));
    } catch (error) {
      console.log("Error :", error);
    }
  }
};
