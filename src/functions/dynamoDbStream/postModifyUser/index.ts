import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
  UpdateItemCommand,
  UpdateItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBStreamHandler } from "aws-lambda";

export const handler: DynamoDBStreamHandler = async (event, _context, _callback) => {
  const db = new DynamoDBClient({ region: process.env.REGION });

  for (let record of event.Records) {
    if (!record.dynamodb.OldImage.emailVerified) {
      return;
    }
    // if user info is updated, then:
    // update that info everywhere in table,
    const oldOrgName = record.dynamodb.OldImage.name.S;
    const oldFirstName = record.dynamodb.OldImage.firstName.S;
    const oldLastName = record.dynamodb.OldImage.lastName.S;
    const oldEmail = record.dynamodb.OldImage.email.S;
    const newOrgName = record.dynamodb.NewImage.name.S;
    const newFirstName = record.dynamodb.NewImage.firstName.S;
    const newLastName = record.dynamodb.NewImage.lastName.S;
    const newEmail = record.dynamodb.NewImage.email.S;
    const userId = record.dynamodb.NewImage.pk1.S;
    const orgId = record.dynamodb.NewImage.pk.S;
    if (oldOrgName !== newOrgName) {
      console.log("Stream record: ", JSON.stringify(record, null, 2));
      // -------------------------- Org Name Updated ----------------------------
      // Get all the entry with old info
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "pk = :pk and begins_with(sk, :sk)",
          ExpressionAttributeValues: marshall({
            ":pk": orgId,
            ":sk": "u#",
          }),
          ScanIndexForward: false,
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery(LastEvaluatedKey);
        }
      };

      await recursiveQuery();
      // Update all entries with new info
      // Do not update updatedAt field as we update it only when role is updated.

      const updates = { name: record.dynamodb.NewImage.name.S };
      for (let item of items) {
        const objKeys = Object.keys(updates);
        const updateParams: UpdateItemCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          Key: marshall({ pk: item.pk.S, sk: item.sk.S }),
          UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`)}`,
          ExpressionAttributeNames: objKeys.reduce(
            (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
            {}
          ),
          ExpressionAttributeValues: marshall(
            objKeys.reduce(
              (acc, key, index) => ({
                ...acc,
                [`:value${index}`]: updates[key],
              }),
              {}
            )
          ),
        };

        try {
          await db.send(new UpdateItemCommand(updateParams));
        } catch (error) {
          console.log("Error :", error);
        }
      }
    } else if (
      oldEmail !== newEmail ||
      oldFirstName !== newFirstName ||
      oldLastName !== newLastName
    ) {
      console.log("Stream record: ", JSON.stringify(record, null, 2));
      // -------------------------- User info Updated ----------------------------
      // Get all the entry with old info
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          IndexName: "GSI1",
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "pk1 = :pk1 and begins_with(sk1, :sk1)",
          ExpressionAttributeValues: marshall({
            ":pk1": userId,
            ":sk1": "o#",
          }),
          ScanIndexForward: false,
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery(LastEvaluatedKey);
        }
      };

      await recursiveQuery();
      // Update all entries with new info
      // Do not update updatedAt field as we update it only when role is updated.
      const updates = {
        firstName: record.dynamodb.NewImage.firstName.S,
        lastName: record.dynamodb.NewImage.lastName.S,
        email: record.dynamodb.NewImage.email.S,
      };
      for (let item of items) {
        const objKeys = Object.keys(updates);
        const updateParams: UpdateItemCommandInput = {
          TableName: process.env.FORM_BUILDER_DATA_TABLE,
          Key: marshall({ pk: item.pk.S, sk: item.sk.S }),
          UpdateExpression: `SET ${objKeys.map((_, index) => `#key${index} = :value${index}`)}`,
          ExpressionAttributeNames: objKeys.reduce(
            (acc, key, index) => ({ ...acc, [`#key${index}`]: key }),
            {}
          ),
          ExpressionAttributeValues: marshall(
            objKeys.reduce(
              (acc, key, index) => ({
                ...acc,
                [`:value${index}`]: updates[key],
              }),
              {}
            )
          ),
        };

        try {
          await db.send(new UpdateItemCommand(updateParams));
        } catch (error) {
          console.log("Error :", error);
        }
      }
    }
  }
};
