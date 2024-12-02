
import { NextResponse } from "next/server";
import { providers, utils, Contract } from 'ethers';
import cors from '../../../lib/cors';
import { abi } from '../../../lib/abi';
import { ethers } from "ethers";
import {govABI } from '../../../lib/abi/govAbi';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const ROOTSTOCK_RPC_NODE = "https://public-node.rsk.co";

const rskProvider = new providers.JsonRpcProvider(ROOTSTOCK_RPC_NODE);

const govAddress = '0x71ac6ff904a17f50f2c07b693376ccc1c92627f0'.toLowerCase();

const govContract = new Contract(govAddress, govABI, rskProvider);

const interfaceDAO = new ethers.utils.Interface(govABI);

const stRif = '0x5db91e24bd32059584bbdb831a901f1199f3d459'.toLowerCase();

const STRIFTokenContract = new Contract(stRif, abi, rskProvider);

const strifbalance = async (address: string) => {
  const balance = await STRIFTokenContract.balanceOf(address.toLowerCase());
  const formattedBalance = utils.formatUnits(balance, 18);
  
  return formattedBalance;
}


const fetchProposals = async (govAddress: string) => {
  const topic =
    '0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0';
  const baseUrl = 'https://rootstock.blockscout.com';
  let fromBlock = '';

  try {
    const response = await fetch(
      `${baseUrl}/api?module=account&action=txlist&address=${govAddress}&sort=asc`
    );

    if (response.ok && response.status === 200) {
      const data = await response.json();
      const [firstTx] = data.result;

      if (firstTx) {
        fromBlock = firstTx.blockNumber?.toString();
      }

      const responseEvents = await fetch(
        `${baseUrl}/api?module=logs&action=getLogs&address=${govAddress}&toBlock=latest&fromBlock=${fromBlock}&topic0=${topic}`
      );

      if (responseEvents.ok && responseEvents.status === 200) {
        const eventsData = await responseEvents.json();
        return Promise.resolve(eventsData.result);
      }
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  } catch (e) {
    return Promise.resolve({ error: e });
  }
};

function isValidAddress(address: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(address)
}

export const GET = async (req: any, context: any) => { 

  const { params } = context;

  if(!isValidAddress(params.id)) {
    return NextResponse.json({
      msg: 'Address is not valid!'
    }, { status: 200, headers: corsHeaders });
  }

  const balance = await strifbalance(params.id);

  const encodedList = await fetchProposals(govAddress);

  const decodedList = await Promise.all(encodedList.map(async (encoded: any) => {

    const decoded = interfaceDAO.decodeEventLog(
      'ProposalCreated',
      encoded.data,
      encoded.topics.filter((a: string) => a)
    );

    const hasVoted = await govContract.hasVoted(
      decoded.proposalId.toString(),
      params.id.toLowerCase()
    );

    return {
      proposalId: decoded.proposalId.toString(),
      description: decoded.description,
      hasVoted: hasVoted,
    }
  }));


  const found = decodedList.find((ele: any) => ele.hasVoted);

 
  return NextResponse.json({
    data: {
      network: 'mainnet',
      strif: balance,
      hasVoted: found ? true: false,
      proposalId: found ? found.proposalId: '',
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