// 1. Import everything
var Web3 = require('web3');
var addresses = require('../src/utils/addresses');
var providersAlchemy = require('../src/utils/provider');
var fs = require("fs")
var ABIs = require('../src/utils/aaveLenderV2ABI');
var dotenv = require('dotenv')
const { Wallet, BigNumber, ethers, providers } = require('ethers')
const { FlashbotsBundleProvider, FlashbotsBundleResolution } = require('@flashbots/ethers-provider-bundle');

dotenv.config();

async function start(opportunity) {

	env = 'mainnet'
	const provider = new providers.WebSocketProvider(providersAlchemy[env])
	const { PRIVATE_KEY, API_KEY } = process.env;


	const accountFrom = {
		privateKey: PRIVATE_KEY,
		address: '0x3870ade8D95c2799Ac6148Ec0aAbF29ca283a568',
  	};


	const authSigner = Wallet.createRandom()

	const GWEI = BigNumber.from(10).pow(9)


    let inputAmount = opportunity['inputAmount']
    let token = opportunity['token']
    let userData = opportunity['userData']
	let profit = opportunity['profit']


    const web3 = new Web3(new Web3.providers.WebsocketProvider(providersAlchemy[env]))
	const flashbotsProvider = await FlashbotsBundleProvider.create(
		provider,
		authSigner,
		'https://relay.flashbots.net'
	)

	const wallet = new Wallet(PRIVATE_KEY)

    let gasPrice = BigNumber.from(await web3.eth.getGasPrice())
	const blockNumber = await provider.getBlockNumber()
	const block = await provider.getBlock(blockNumber)
	const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(block.baseFeePerGas, 6) // 100 blocks in the future

    let liquidator = new web3.eth.Contract(ABIs['LIQUIDATOR'], addresses[env]['liquidator']);

	let gasLimit = await liquidator.methods.startFlashloan([token], [inputAmount], userData, profit.mul(5).div(10)).estimateGas({from: accountFrom['address']})
	let gasFee = gasPrice.add(maxBaseFeeInFutureBlock)

	let toCoinbase
	if (netProfit.lt(BigNumber.from('10000000000000000'))){
		toCoinbase = BigNumber.from('0')
	}
	else if (netProfit.gt(BigNumber.from('10000000000000000')) && netProfit.lt(BigNumber.from('1000000000000000000'))){
		toCoinbase = netProfit.mul(9).div(10)
	}
	else{
		toCoinbase = netProfit.mul(7).div(10)
	}
	netProfit = netProfit.sub(toCoinbase)

	let transactionData = await liquidator.methods.startFlashloan([token], [inputAmount], userData, toCoinbase).encodeABI()

	if (netProfit.gt(BigNumber.from(0))){

		transaction =  {
			to: addresses[env]['liquidator'],
			type: 2,
			maxFeePerGas: gasFee,
			maxPriorityFeePerGas: GWEI.mul(BigNumber.from(20)),
			data: transactionData,
			chainId: env == 'mainnet'? 1 : 5,
			gasLimit: gasLimit,
		}
		transactionBundle = [{
			signer: wallet,
			transaction: transaction
		}]
		const signedTransactions = await flashbotsProvider.signBundle(transactionBundle)

		// 6. We run a simulation for the next block number with the signed transactions
		console.log(new Date())
		console.log('Starting to run the simulation...')
		const simulation = await flashbotsProvider.simulate(
			signedTransactions,
			blockNumber,
		)
		console.log(new Date())

		// 7. Check the result of the simulation
		if (simulation.firstRevert) {
			console.log(`Simulation Error: ${simulation.firstRevert.error}`)
		} else {
			console.log(
				`Simulation Success: ${blockNumber}}`
			)
		}

		// 8. Send 3 bundles to get this working for the next blocks in case flashbots doesn't become the block producer
		for (var i = 1; i <= 3; i++) {
			const bundleSubmission = await flashbotsProvider.sendBundle(
				transactionBundle,
				blockNumber + i
			)
			console.log('bundle submitted, waiting', bundleSubmission.bundleHash)

			const waitResponse = await bundleSubmission.wait()
			console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)
			if (
				waitResponse === FlashbotsBundleResolution.BundleIncluded ||
				waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh
			) {
				console.log('Bundle included!')
				break
			} else {
				console.log({
					bundleStats: await flashbotsProvider.getBundleStats(
						bundleSubmission.bundleHash,
						blockNumber + i,
						
					),
					userStats: await flashbotsProvider.getUserStats(),
				})
			}
		}
		console.log('bundles submitted')
	}
	else{
		console.log('net profit too low')
	}
}



function main(){
    fs.watch('./opportunity', function(event, filename){
        if (filename){
            if (event == 'rename'){
                let opportunity = JSON.parse(fs.readFileSync('./opportunity/' + filename, 'utf8'))
                start(opportunity)
            }
    
        } else{
            console.log('filename not provided')
        }
        
    })
}

main()


