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

    try {
      // if org member is deleted, then:
      // decrement count of member,
      const orgId = record.dynamodb.OldImage.orgId.S;
      const updateparams: UpdateItemCommandInput = {
        TableName: process.env.USERS_TABLE,
        Key: marshall({ userId: orgId }),
        UpdateExpression: `SET memberCount = if_not_exists(memberCount, :start) - :decrement`,
        ExpressionAttributeValues: marshall({
          ":decrement": 1,
          ":start": 1,
        }),
      };

      // TODO: Think about implications of removing org member
      console.log("Updating members count...");
      await db.send(new UpdateItemCommand(updateparams));
    } catch (error) {
      console.log("Error :", error);
    }
  }
};
