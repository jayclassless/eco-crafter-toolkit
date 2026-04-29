import type { LambdaFunctionURLEvent, LambdaFunctionURLResult } from 'aws-lambda'

import { handleSteamNews } from './handler'

export const handler = async (event: LambdaFunctionURLEvent): Promise<LambdaFunctionURLResult> => {
  try {
    const result = await handleSteamNews({
      count: event.queryStringParameters?.count ?? null,
    })
    return {
      statusCode: result.status,
      headers: result.headers,
      body: result.body,
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    }
  }
}
