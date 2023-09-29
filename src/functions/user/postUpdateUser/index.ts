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
    // if user info is updated, then:
    // update that info everywhere in table,
    const oldOrgName = record.dynamodb.OldImage.orgName.S;
    const oldFirstName = record.dynamodb.OldImage.firstName.S;
    const oldLastName = record.dynamodb.OldImage.lastName.S;
    const oldEmail = record.dynamodb.OldImage.email.S;
    const newOrgName = record.dynamodb.NewImage.orgName.S;
    const newFirstName = record.dynamodb.NewImage.firstName.S;
    const newLastName = record.dynamodb.NewImage.lastName.S;
    const newEmail = record.dynamodb.NewImage.email.S;
    const userId = record.dynamodb.NewImage.id.S;
    if (oldOrgName !== newOrgName) {
      console.log("Stream record: ", JSON.stringify(record, null, 2));
      // -------------------------- Org Name Updated ----------------------------
      // Get all the entry with old info
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.ORG_MEMBERS_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "orgId = :orgId",
          ExpressionAttributeValues: marshall({
            ":orgId": userId, // userId is same as orgId
          }),
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

      const updates = { orgName: newOrgName };
      for (let item of items) {
        const objKeys = Object.keys(updates);
        const updateParams: UpdateItemCommandInput = {
          TableName: process.env.ORG_MEMBERS_TABLE,
          Key: marshall({ orgId: item.orgId.S, userId: item.userId.S }),
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

      // Update Organization Roles
      // Get all the entry with old info
      let items: Record<string, AttributeValue>[] = [];
      const recursiveQuery1 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.ORG_MEMBERS_TABLE,
          IndexName: "userId-orgId-index",
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: marshall({
            ":userId": userId,
          }),
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery1(LastEvaluatedKey);
        }
      };

      await recursiveQuery1();
      // Update all entries with new info
      // Do not update updatedAt field as we update it only when role is updated.
      const updates = {
        firstName: newFirstName,
        lastName: newLastName,
        email: newEmail,
      };
      for (let item of items) {
        const objKeys = Object.keys(updates);
        const updateParams: UpdateItemCommandInput = {
          TableName: process.env.ORG_MEMBERS_TABLE,
          Key: marshall({ orgId: item.orgId.S, userId: item.userId.S }),
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

      // Update workspace Roles
      // Get all the entry with old info
      items = [];
      const recursiveQuery2 = async (lastEvaluatedKey?: Record<string, AttributeValue>) => {
        const params: QueryCommandInput = {
          TableName: process.env.WORKSPACE_MEMBERS_TABLE,
          IndexName: "userId-workspaceId-index",
          ExclusiveStartKey: lastEvaluatedKey,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: marshall({
            ":userId": userId,
          }),
        };
        const { Items, LastEvaluatedKey } = await db.send(new QueryCommand(params));
        Items.forEach((i) => items.push(i));
        if (LastEvaluatedKey) {
          await recursiveQuery2(LastEvaluatedKey);
        }
      };

      await recursiveQuery2();

      // Update all entries with new info

      for (let item of items) {
        const objKeys = Object.keys(updates);
        const updateParams: UpdateItemCommandInput = {
          TableName: process.env.WORKSPACE_MEMBERS_TABLE,
          Key: marshall({ workspaceId: item.workspaceId.S, userId: item.userId.S }),
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
