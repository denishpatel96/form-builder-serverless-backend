import * as fs from "fs";
import { DynamoDBClient, GetItemCommand, GetItemCommandInput } from "@aws-sdk/client-dynamodb";
import { SES, SendEmailCommandInput, SendEmailCommand } from "@aws-sdk/client-ses";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyHandler } from "aws-lambda";
const db = new DynamoDBClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
  };
  try {
    const body: any = event.body ? JSON.parse(event.body) : {};
    const { orgId, email, role } = body;
    const claimedUsername = event.requestContext.authorizer?.jwt.claims["cognito:username"];

    if (!(orgId && email)) {
      return {
        statusCode: 400,
        ...corsHeaders,
        body: JSON.stringify({ message: "orgId and email are required" }),
      };
    }

    const params: GetItemCommandInput =
      orgId === claimedUsername
        ? {
            TableName: process.env.USERS_TABLE,
            Key: marshall({
              id: claimedUsername,
            }),
          }
        : {
            TableName: process.env.ORGANIZATION_ROLES_TABLE,
            Key: marshall({
              orgId: orgId,
              userId: claimedUsername,
            }),
          };
    const { Item } = await db.send(new GetItemCommand(params));
    const userData = Item ? unmarshall(Item) : null;

    if (claimedUsername !== orgId && !(userData && userData.role === "admin")) {
      return {
        statusCode: 403,
        ...corsHeaders,
        body: JSON.stringify({
          message: "You are not authorized to invite a member to this organization.",
        }),
      };
    }

    // Check if member exists on the platform
    // If yes - send email and in account notification
    // If no - send email that leads to signup

    const dirPath = process.env.LAMBDA_TASK_ROOT
      ? process.env.LAMBDA_TASK_ROOT + "/dist/orgMember/inviteOrgMember/"
      : __dirname;

    const url = process.env.STAGE === "prod" ? "https://vtwinforms.com" : "http://localhost:3000";
    const link = url + `/login`;
    const inviterName = `${userData.firstName} ${userData.lastName}`;
    const orgName = userData.orgName;
    let template = fs.readFileSync(dirPath + "invitedToOrganizationEmail.html", "utf8");
    template = template.replace(/\$ORG\$/g, orgName);
    template = template.replace(/\$INVITER\$/g, inviterName);
    template = template.replace(/\$EMAIL\$/g, email);
    template = template.replace(/\$ROLE\$/g, role);
    template = template.replace(/\$LINK\$/g, link);
    await sendEmail(email, "Invitation to be a member", template);

    return {
      statusCode: 200,
      ...corsHeaders,
      body: JSON.stringify({
        message: "Member invited successfully!",
      }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: e?.$metadata?.httpStatusCode || 500,
      ...corsHeaders,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack }),
    };
  }
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
