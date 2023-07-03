import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

interface DBItem extends Record<string, any> {
  name: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: string;
  pk1: string;
  sk1: string;
  sk: string;
  pk: string;
  type: string;
  memberCount: number;
  formCount: number;
  workspaceCount: number;
  responseCount: number;
}

interface User {
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: string;
  orgName: string;
  orgId: string;
  memberCount: number;
  formCount: number;
  workspaceCount: number;
  responseCount: number;
}

export interface Workspace {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  formCount: number;
  memberCount: number;
  responsesCount: number;
}

const processData = (data: DBItem[]) => {
  const userData = data.find((i) => i.type === "USER");

  let user: User = {
    firstName: userData.firstName,
    lastName: userData.lastName,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt,
    email: userData.email,
    emailVerified: userData.emailVerified,
    orgName: userData.name,
    orgId: userData.pk1.substring(2),
    memberCount: userData.memberCount,
    formCount: userData.formCount,
    workspaceCount: userData.workspaceCount,
    responseCount: userData.responseCount,
  };

  const workspaceData = data.filter((i) => i.type === "WS");
  let workspaces: Workspace[] = workspaceData.map((i) => {
    return {
      id: i.pk1.substring(2),
      name: i.name,
      updatedAt: i.updatedAt,
      createdAt: i.createdAt,
      formCount: i.formCount,
      memberCount: i.memberCount,
      responsesCount: i.responseCount,
    };
  });
  return { user, workspaces };
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const userSub = event.requestContext.authorizer?.claims.sub;
    const { userId } = event.pathParameters;

    if (!(userSub && userId && userId === userSub)) {
      return {
        statusCode: 401,
        ...corsHeaders,
        body: JSON.stringify({ message: "Unauthorized" }),
      };
    }

    const params: QueryCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      KeyConditionExpression: "#userId = :userId",
      ExpressionAttributeNames: {
        "#userId": "pk",
      },
      ExpressionAttributeValues: marshall({
        ":userId": `u#${userId}`,
      }),
    };
    const { Items } = await db.send(new QueryCommand(params));

    const data = Items.map((i) => unmarshall(i));
    if (data && data.length > 0) {
      const userData = processData(data as DBItem[]);
      return {
        statusCode: 200,
        ...corsHeaders,
        body: JSON.stringify(userData),
      };
    } else {
      return {
        statusCode: 404,
        ...corsHeaders,
        body: JSON.stringify({ message: "User not found." }),
      };
    }
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
};
