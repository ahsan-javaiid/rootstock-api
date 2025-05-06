
import { NextResponse } from "next/server";
import { providers, utils, Contract } from 'ethers';
import cors from '../../../lib/cors';
import { abi } from '../../../lib/abi';
import { ethers } from "ethers";
import {getDatePast24Hours, getHoursDifference, getPreviousDate, isWithin, isAmountValid, isDateValid, getExchangeRate, telemetry } from "@/app/lib/utils";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const ROOTSTOCK_RPC_NODE = "https://public-node.rsk.co";

const rskProvider = new providers.JsonRpcProvider(ROOTSTOCK_RPC_NODE);

const stRif = '0x5db91e24bd32059584bbdb831a901f1199f3d459'.toLowerCase();

const STRIFTokenContract = new Contract(stRif, abi, rskProvider);

function isValidAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

async function calculateEntries(account: string, startDate: string, endDate: string) { // campaign start date
  let windowStart = getDatePast24Hours();

  const isWindow = isWithin(windowStart.toISOString(), startDate, endDate);

  if (!isWindow) {
    return {
      msg: 'Balance & tickets calculation does not apply on campaign future start date or after campaign end date. Users need to claim tickets every 24h after campaing start. Secondly, wait atleast 24h after campaign start to claim first entry to ensure the sustainable stRIF holding.',
      balance: 0,
      tickets: 0
    }
  }
  
  const currentBlock = await rskProvider.getBlock("latest");
  const currentBalance = await STRIFTokenContract.balanceOf(account.toLowerCase());

  const approxBlocksPerDay = Math.floor((24 * 60 * 60) / 25); // 30s block time
  const startBlockGuess = currentBlock.number - approxBlocksPerDay;

  console.log('startBlockGuess:', startBlockGuess);
  // closest block at ~24 hours ago

  let bestBlock = startBlockGuess;

  const pastBalance = await STRIFTokenContract.balanceOf(account, { blockTag: bestBlock });

  const minBalance = currentBalance.lt(pastBalance) ? currentBalance : pastBalance;
  const stakedUnits = ethers.utils.formatUnits(minBalance, 18);
  const entries = Math.min(Math.floor(parseFloat(stakedUnits) / 100), 60);

  return {
    balance: Number(stakedUnits),
    tickets: entries
  };
}

export const GET = async (req: any, context: any) => { 

  const { params } = context;
  const searchParams = req.nextUrl.searchParams;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate) {
    return NextResponse.json({
      msg: 'Start date is required!'
    }, { status: 200, headers: corsHeaders });
  }

  if (!isDateValid(startDate)) {
    return NextResponse.json({
      msg: 'Start date is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  if(!isValidAddress(params.id)) {
    return NextResponse.json({
      msg: 'Address is not valid!'
    }, { status: 200, headers: corsHeaders });
  }


  const result = await calculateEntries(params.id.toLowerCase(), startDate, endDate);
 
  return NextResponse.json({
    data: {
      ...result,
      network: 'mainnet',
      token: 'stRIF',
      holdingDuration: '24h'
    }
  }, { status: 200, headers: corsHeaders });
}

export async function OPTIONS(request: Request) {
  return cors(
    request,
    new Response(null, {
      status: 204,
    })
  );
}