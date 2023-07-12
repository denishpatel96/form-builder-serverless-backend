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

interface role {
  orgId: string;
  orgName: string;
  role: string;
  updatedAt: string;
  createdAt: string;
}

interface User {
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  email: string;
  emailVerified: string;
  orgName: string;
  id: string;
  memberCount: number;
  formCount: number;
  responseCount: number;
  workspaceCount: number;
  roles: role[];
}

const processData = (data: DBItem[]) => {
  const userData = data.find((i) => i.type === "USER");
  const organizationsData = data.filter((i) => i.type === "O_MEM");

  let user: User = {
    firstName: userData.firstName,
    lastName: userData.lastName,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt,
    email: userData.email,
    emailVerified: userData.emailVerified,
    orgName: userData.name,
    id: userData.pk1.substring(2),
    memberCount: userData.memberCount,
    formCount: userData.formCount,
    responseCount: userData.responseCount,
    workspaceCount: userData.workspaceCount,
    roles: organizationsData.map((i) => {
      return {
        orgId: i.pk1.substring(2),
        orgName: i.name,
        role: i.role,
        updatedAt: i.updatedAt,
        createdAt: i.createdAt,
      };
    }),
  };
  return user;
};

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const claimedUserSub = event.requestContext.authorizer?.jwt.claims.sub;
    const { userSub } = event.pathParameters;

    if (!(claimedUserSub && userSub && claimedUserSub === userSub)) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({ message: "You are not authorized to fetch other user's info." }),
      };
    }

    const params: QueryCommandInput = {
      TableName: process.env.FORM_BUILDER_DATA_TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "pk1 = :pk1",
      ExpressionAttributeValues: marshall({
        ":pk1": `u#${userSub}`,
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
