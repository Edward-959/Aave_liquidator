var Web3 = require('web3');
var ethers = require('ethers');
var BN = ethers.BigNumber;
var fs = require('fs');
var aaveLenderV2Abi = require('./utils/aaveLenderV2ABI');
var reserveListRaw = require('./utils/aave_reserve_list');
var utils = require('./utils');
var addresses = require('./utils/addresses');
var providers = require('./utils/provider');
var optimizer = require('./uniswap_optimizer');


// 整个monitor只有一个未知量，user
// provider只监控health < 1的user，并返回
// 其他变量中，reserveConfiguration在全局中事先取出，可以设置每1000个block更新一次

// oraclePrice等信息需要在当前block直接取出
env = 'mainnet';
ether = BN.from('1000000000000000000');
gwei = BN.from('1000000000');
web3 = new Web3(new Web3.providers.WebsocketProvider(providers[env]));
dataDir = './data/filteredBorrowerBig.json';
pairDir = './data/uniswapV2PairArray.json';
opportunityDir = './opportunity/';


(init = async ()=> {



    let reserveList = reserveListRaw['reserveList'][env]
    let addressList = JSON.parse(fs.readFileSync(dataDir, 'utf8'))
    let uniswapPairList = JSON.parse(fs.readFileSync(pairDir, 'utf8'))

    const ethersWSChainProvider = new ethers.providers.WebSocketProvider(providers[env])
    var aaveLendingPool = new web3.eth.Contract(aaveLenderV2Abi['AAVE_LENDER_ABI'], addresses[env]['aaveLendingPoolAddress'])
    var aaveOracle = new web3.eth.Contract(aaveLenderV2Abi['AAVE_ORACLE'], addresses[env]['aaveOracleAddress'])
    var aaveBatchQuery = new web3.eth.Contract(aaveLenderV2Abi['BATCH_QUERY'], addresses[env]['aaveBatchQueryAddress'])

    let rawReserveInformation = await aaveBatchQuery.methods.batchQueryReservesConfiguration(reserveList, addresses[env]['aaveProtocolDataProviderAddress']).call()
    let liquidationBonusList = rawReserveInformation[0]
    let usageAsCollateralEnabledList = rawReserveInformation[1] 
    let decimalsList = rawReserveInformation[2] 
    let lock = false
    let liquidateUserList = []

    let firstBlockNumber = 0
    let newBorrowers = []

    web3._provider.on('disconnect', async(code) =>{
        console.log('||||||||||||||ws closed||||||||||||||', code);
        ethersWSChainProvider._websocket.terminate();
        await sleep(30000); // wait before reconnect
        init();
    })


    ethersWSChainProvider._websocket.on('close', async (code) => {
        console.log('||||||||||||||ws closed||||||||||||||', code);
        ethersWSChainProvider._websocket.terminate();
        await sleep(30000); // wait before reconnect
        init();
      });

    
    ethersWSChainProvider.on("block",  async(blockNumber, err) =>{
        if (firstBlockNumber = 0){
            firstBlockNumber = blockNumber
        }

        try{
            if (lock == false){
                lock = true
                console.log('Block ' + blockNumber.toString() + ': Looking For Opportunities in Block ')
                // 批量查询存贷健康情况
                // console.time('test1')
                let result = await aaveBatchQuery.methods.batchQueryUserHealth(addressList, addresses[env]['aaveLendingPoolAddress']).call()
                // console.timeEnd('test1')
                liquidateUserList = getLiquidateAddress(addressList, result[0])
                ///////////////////////////////////////////测试代码  
                let liquidateUserListOutput = {}
                for (let i = 0; i < result[0].length; i ++){
                    let threshHold = ether.mul(BN.from(15)).div(BN.from(10))
                    let healthFactor = BN.from(result[0][i])
                    if (healthFactor.lt(threshHold)){
                        liquidateUserListOutput[addressList[i]] = result[0][i]
                    }
                }

                
                let newArr = JSON.stringify(liquidateUserListOutput)
                fs.writeFileSync('./health_factor/Block ' + blockNumber + 'health_factor.json', newArr, 'utf8', (err) =>{
                    console.log('写入成功', err)
                })
                //////////////////////////////////////////////
                if (liquidateUserList.length > 0){
                    console.log('\nBlock ' + blockNumber.toString() + ': LiquidationOpportunity Finded')
                    // 获取被清算人的抵押品债务信息
                    let rawLoanInformation = await aaveBatchQuery.methods.batchQueryUserReserves(reserveList, liquidateUserList, addresses[env]['aaveProtocolDataProviderAddress']).call()
                    console.log('  Acquiring debt collateral Asset')
                    let debtCollateralList = getLoanInformation(liquidateUserList, reserveList, rawLoanInformation)
                    console.log('\n  Acquring debt collateral Price')
                    let resultsPrice = await aaveOracle.methods.getAssetsPrices(reserveList).call()
                    // for (let i = 0; i < liquidateUserList.length; i++)      
                    for (let i = 0; i < 1; i++){             
                        let user = liquidateUserList[i]
                        console.log('\n Calculating user: ' + user + ' liquidation plan')         
                        let debtCollateralUser = debtCollateralList[i]
                        // 暂时只取最大债务和最大抵押品执行清算
    
                        let largestDCIndex = getLargestDebtCollateral(debtCollateralUser, decimalsList, usageAsCollateralEnabledList, resultsPrice, decimalsList)
                        let debtIndex = largestDCIndex[0]
                        let collateralIndex = largestDCIndex[1]
                        let debtList = debtCollateralUser[0]
                        let collateralList = debtCollateralUser[1]
                        let currentDebt = BN.from(debtList[debtIndex])
                        let currentCollateral = BN.from(collateralList[collateralIndex])
                        let debtPrice = BN.from(resultsPrice[debtIndex])
                        let collateralPrice = BN.from(resultsPrice[collateralIndex])
                        console.log('\n   Debt Asset: ' + reserveList[debtIndex])
                        console.log('   Collateral Asset: ' + reserveList[collateralIndex])
                        console.log('   Debt asset price in ETH: ' + debtPrice.toString())
                        console.log('   Collateral asset price in ETH: ' + collateralPrice.toString())
                        console.log('   Debt Amount: ' + currentDebt.toString())
                        console.log('   CollateralAmount: ' + currentCollateral.toString())
                        // 获取清算奖励
                        let lb = liquidationBonusList[collateralIndex]
                        // 获取抵押物和债务价格
                        // let results1 = await aaveOracle.methods.getAssetsPrices([reserveList[debtIndex], reserveList[collateralIndex]]).call()
    
                        lb = BN.from(lb)
                        console.log('\n   Calculating max debt that can be cleared')
                        // 这是依据债务推算的最大可清算collateral量，但需要与我们获取的最大collateral作比较，
                        // 取小的那个做为可执行清算的最大量
                        // 这是因为用户可能有多笔抵押品，造成根据债务计算的理论最大抵押品量，比当前我们获取的最大一笔抵押物还要多。
                        // 这里获取的最大可清算抵押品量，还要与是市场容量作比较，才能获取最终执行的清算量。
                        let maxToLiquidate = getMaxAmountToLiquidate(currentDebt, lb, debtPrice, collateralPrice, decimalsList[debtIndex], decimalsList[collateralIndex])
                        let maxAmountToLiquidate = maxToLiquidate[0]
                        // 还需要研究一下getMaxAmountToLiquidate函数有没有受到decimals不同的影响。
                        maxAmountToLiquidate = bigNumberMin(maxAmountToLiquidate, currentCollateral)
                        console.log('   Max amount to liquidate in theoreum: ' + maxAmountToLiquidate.toString())
                        // 由此开始公开市场操作
                        // 计划要至少从UniswapV2, UniswapV3, Curve三处获取池子信息进行清算
                        // 目前比较完善的只有UniswapV2部分
                        let targetDict = getTargetUniswapV2WETHPools(reserveList[debtIndex], reserveList[collateralIndex], uniswapPairList)
                        let pairInformation = await aaveBatchQuery.methods.uniswapV2PairsBatchQuery(targetDict['queryList']).call()
                        // 计算出用于闪电贷的inputAmount, debtAmount, collateralAmount, profit信息
                        // inputAmount 是闪电贷借入的weth数量，同时是整个兑换链条中的第一个输入值，需要用这个数字来作为基准计算一笔交易的利润
                        // debtAmount 是清算债务的数量，用于向aave V2 lendingPool 提交liquidateCall请求
                        // profit 理论计算的profit, 用于在扣除gas费用后估算交易利润并按比例向矿工提交交易费
                        // [inputAmount, debtAmount, collateralAmount, profit, outputAmount] 
                        // console.log(pairInformation)
                        let result = await getAssetInAndMaxmumProfit(targetDict, pairInformation, lb, debtPrice, collateralPrice, maxAmountToLiquidate)
    
                        let inputAmount = result[0]
                        let debtAmount = result[1].mul(BN.from(9999)).div(BN.from(10000))
                        let collateralAmount = result[2]
                        let outputAmount = result[4].mul(BN.from(9999)).div(BN.from(10000))
                        let profit = result[3]
    
    
                        // 将计算出的信息进行打包，并发给链上进行闪电贷操作。
                        if (inputAmount.gt(BN.from(0))){
                            console.log('    Flashloan amount: ' + inputAmount.toString())
                            console.log('    Liquidate debt amount: ' + debtAmount.toString())
                            console.log('    Liquidate collateral amount: ' + collateralAmount.toString())
                            console.log('    Estimate Profit: ' + profit.toString())
                            let userData = getUserData(debtAmount, outputAmount, targetDict, user)
                            writeOpportunity(userData, profit, inputAmount, opportunityDir)
    
                        }
                        else{
                            console.log('Block ' + blockNumber +':  Opportunity is not profitable')
                            addressList = deleteFactor(addressList, user)
                            writeInJson(addressList, dataDir)
                        }
    
                    }
                }
                else{
                    console.log('Block ' + blockNumber.toString()  + ': No Liquidation Opportunity')
                }
                // 更新借债人表和储存信息表
    
                // addressList = await updateNewBorrowers(aaveLendingPool, aaveBatchQuery, addressList, dataDir, blockNumber, newBorrowers)
    
                if ((blockNumber - firstBlockNumber) % 10000 == 0){
                    rawReserveInformation = await aaveBatchQuery.methods.batchQueryReservesConfiguration(reserveList, addresses[env]['aaveProtocolDataProviderAddress']).call()
                    liquidationBonusList = rawReserveInformation[0]
                    usageAsCollateralEnabledList = rawReserveInformation[1] 
                    decimalsList = rawReserveInformation[2] 
                    console.log('\nBlock ' + blockNumber.toString() + ': Update latest reservesConfiguration')
                }
            
                lock = false
            }

        }
        catch{
            console.log('|||||||||||||||errored|||||||||||||', err);
            ethersWSChainProvider._websocket.terminate();
        }


    })

})

function sleep(ms){
    return new Promise(resolve=>setTimeout(resolve, ms))

}

async function updateNewBorrowers(aaveLendingPool, aaveBatchQuery, addressList, dataDir, blockNumber, newBorrowers){
    let liquidationThre = ethers.BigNumber.from('10000000000000000000')
    let healthThreHigh = ethers.BigNumber.from('2000000000000000000')
    let healthThreLow = ethers.BigNumber.from('1000000000000000000')
    let options = {
        filter: {},
        fromBlock: "latest",                 
        toBlock: "latest"
    }
    let newBorrows = await aaveLendingPool.getPastEvents('Borrow', options)
    if (newBorrows.length > 0){
        for (k = 0; k < newBorrows.length; k++){
            newBorrowers.push(newBorrows[k]['returnValues']['user'])
        }

        let newBatchBorrower = await aaveBatchQuery.methods.batchQueryUserHealth(newBorrowers, addresses[env]['aaveLendingPoolAddress']).call()
        for (k = 0; k < newBatchBorrower[0].length; k++){
            if(newBatchBorrower[1][k] > ether.mul(BN.from(10))
                && ethers.BigNumber.from(newBatchBorrower[0][k]).lte(healthThreHigh)
                && ethers.BigNumber.from(newBatchBorrower[0][k]).gte(healthThreLow)){
                addressList.push(newBorrowers[k])
            }
        }
        writeInJson(addressList, dataDir)
        console.log('\nBlock ' + blockNumber.toString() + ': Update latest borrower')
    }
    return addressList
}



function writeOpportunity(userData, profit, inputAmount, opportunityDir){
    let functionData = {}
    let token = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

    functionData = {'token': token,
                    'inputAmount': inputAmount,
                    'profit': profit,
                    'userData': userData
                }
    let newArr = JSON.stringify(functionData)

    let files = fs.readdirSync(opportunityDir)
    let counts = files.length + 1

    fs.writeFileSync(opportunityDir + 'opportunity' + counts + '.json', newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })
}

function writeInJson(list, dir){
    let newArr = JSON.stringify(list)
    fs.writeFileSync(dir, newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })
}

function deleteFactor(list, factor){
    for (let i = 0; i < list.length; i ++){
        if (list[i] == factor){
            list.splice(i, 1)
            i --
        }
    }
    return list
}


function bigNumberMin(a, b){
    if (a.lt(b)){
        return a
    }
    else{
        return b
    }
}


function getLiquidateAddress(addressList, healthFactorList){
    let liquidateUserList = []
    // let lowerThre = BN.from('0')
    for (let i = 0; i < healthFactorList.length; i ++){
        if (BN.from(healthFactorList[i]).lt(ether)){
            liquidateUserList.push(addressList[i])
        }
    }
    return liquidateUserList
}


function getMaxAmountToLiquidate(currentDebt, liquidationBonus, debtPrice, collateralPrice, decimalsDebt, decimalsCollateral){
    // 计算该用户最大liquidate的量
    let debtToCover
    let maxAmountToLiquidate
    decimalsDebt = BN.from((10 ** parseInt(decimalsDebt)).toString())
    decimalsCollateral = BN.from((10 ** parseInt(decimalsCollateral)).toString()) 
    // debtToCover = (userStableDebt + userVariableDebt) * LiquidationCloseFactorPercent
    debtToCover = currentDebt.mul(BN.from('5')).div(BN.from('10'))
    // maxAmountOfCollateralToLiquidate = (debtAssetPrice * debtToCover * liquidationBonus)/ collateralPrice
    maxAmountToLiquidate = debtPrice.mul(debtToCover).mul(liquidationBonus).mul(decimalsCollateral).div(decimalsDebt).div(collateralPrice).div(BN.from('10000'))
    return [maxAmountToLiquidate, debtToCover]
}


// 获取被清偿用户的债务和抵押物
function getLoanInformation(userList, reserveList, result){
    let debtList = result[0]
    let collateralList = result[1]
    let userDebtCollateralList = []
    let loop = reserveList.length
    for (let i = 0; i < userList.length; i++){
        let userDebtList = debtList.slice(loop*i, loop*(i+1))
        let userCollateralList = collateralList.slice(loop*i, loop*(i+1))
        userDebtCollateralList[i] = [userDebtList, userCollateralList]
    }
    return userDebtCollateralList
}

function getLargestDebtCollateral(userDebtCollateralList, decimalsList, usageAsCollateralEnabledList, priceList, decimalsList){
    // 函数分别获取所有aave储备资产(reserveList)中该用户最大的一笔负债和抵押物，返回的是负债和抵押物在reserveList中的序号
    let largestDB = []
    let debtList = userDebtCollateralList[0]
    let collateralList = userDebtCollateralList[1]
    let largestDIndex
    let largestCIndex
    let largestD
    let largestC
    for (let i = 0; i < debtList.length; i++){
        // 用循环找到最大的debt, collateral值，注意只有usageAsCollateralEnabledList = true才能做抵押品
        let etherDecimals = BN.from((10**decimalsList[i]).toString())
        let etherPrice = BN.from(priceList[i])
        let debt = BN.from(debtList[i]).mul(ether).mul(etherPrice).div(etherDecimals)
        let collateral = BN.from(collateralList[i]).mul(ether).mul(etherPrice).div(etherDecimals)
        if (i == 0){
            largestD = debt
            largestC = collateral
            largestDIndex = i
            largestCIndex = i
        }
        else{
            
            if(debt.gt(largestD)){
                largestD = debt
                largestDIndex = i
            }
            if((collateral.gt(largestC)) && (usageAsCollateralEnabledList[i] == true)){
                largestC = debt
                largestCIndex = i
            }
        }
    }  
    // largestDB = [debt序号， collateral序号]
    largestDB = [largestDIndex, largestCIndex]
    return largestDB
}

function getTargetUniswapV2WETHPools(debt, collateral, pairList){
    let collateralPairAddress = pairList[collateral]['weth']
    let debtPairAddress = pairList[debt]['weth']

    if (debt == addresses[env]['weth']){
        return {'collateral': collateral,
                'collateralPool': collateralPairAddress,
                'debt': addresses[env]['weth'],
                'debtPool': 0,
                'queryList': [collateralPairAddress]
            } 
    }
    else if (collateral == addresses[env][['weth']]){
        return {'collateral': addresses[env]['weth'],
                'collateralPool': 0,
                'debt': debt,
                'debtPool': debtPairAddress,
                'queryList': [debtPairAddress]
            } 
    }
    else {
        return {'collateral': collateral,
                'collateralPool': collateralPairAddress,
                'debt': debt,
                'debtPool': debtPairAddress,
                'queryList': [debtPairAddress, collateralPairAddress]
                } 
    }

}



function getUserData(debtAmount, outputAmount, targetDict, user){
    let encodeData = []
    if (targetDict['debtPool'] == 0){
        // [输入数量（闪电贷数量）, 清算数量, 债务池地址， 抵押品池地址，清算策略种类（uniswapV2池种类定为0）]
        encodeData = [debtAmount, '0x0000000000000000000000000000000000000000', targetDict['collateralPool'], targetDict['debt'], targetDict['collateral'], user, outputAmount] 
    }
    else if(targetDict['collateralPool'] == 0){
        encodeData = [debtAmount, targetDict['debtPool'],  '0x0000000000000000000000000000000000000000', targetDict['debt'], targetDict['collateral'], user, outputAmount]
    }
    else{
        encodeData = [debtAmount, targetDict['debtPool'],  targetDict['collateralPool'], targetDict['debt'], targetDict['collateral'], user, outputAmount]
    }
    encodeData = web3.eth.abi.encodeParameters(['uint256', 'address', 'address', 'address', 'address', 'address', 'uint256'], encodeData)
    return encodeData
}

async function getAssetInAndMaxmumProfit(targetDict, pairInformation, lb, dp, cp, maxToLiquidate){
    if (targetDict['debtPool'] == 0){
        let token0 = pairInformation[0]
        let R1t = BN.from(token0 == addresses[env]['weth'] ? pairInformation[2][0] : pairInformation[3][0])
        let R2 = BN.from(token0 == addresses[env]['weth'] ? pairInformation[3][0] : pairInformation[2][0])
        let d1 = token0 == addresses[env]['weth'] ? pairInformation[4][0] : pairInformation[5][0]
        let d2 = token0 == addresses[env]['weth'] ? pairInformation[5][0] : pairInformation[4][0]
        d1 = BN.from((10** parseInt(d1)).toString())
        d2 = BN.from((10** parseInt(d2)).toString())
        let P1 = dp
        let P2 = cp
        // let x1, x2, x1t
        let result = await optimizer.optimizalQuantityWethtoUniswapV2(R1t, R2, P1, P2, lb, d1, d2)
        let inputAmount = result[0]
        let debtAmount = result[0]
        let collateralAmount = result[1]
        let outputAmount = result[2]
        let profit = outputAmount.sub(inputAmount)
        if (inputAmount.lt(ether.mul(5).div(10))){
            return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
        }
        
        else if (collateralAmount.lt(maxToLiquidate)){
            return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
        }
        else{
            // x1t, x1
            result = await optimizer.calcOptimizalQuantityWethtoUniswapV2(R1t, R2, P1, P2, lb, d1, d2, maxToLiquidate)
            debtAmount = result[1]
            inputAmount = result[1]
            collateralAmount = maxToLiquidate
            outputAmount = result[0]
            profit = outputAmount.sub(maxToLiquidate)

            if (inputAmount.lt(ether.mul(5).div(10))){
                return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
            }
            else{
                return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
            }

        }
        
    }
    else if(targetDict['collateralPool'] == 0){
        let token0 = pairInformation[0]
        let R1 = BN.from(token0 == addresses[env]['weth'] ? pairInformation[2][0] : pairInformation[3][0])
        let R2 = BN.from(token0 == addresses[env]['weth'] ? pairInformation[3][0] : pairInformation[2][0])
        let d1 = token0 == addresses[env]['weth'] ? pairInformation[4][0] : pairInformation[5][0]
        let d2 = token0 == addresses[env]['weth'] ? pairInformation[5][0] : pairInformation[4][0]
        d1 = BN.from((10** parseInt(d1)).toString())
        d2 = BN.from((10** parseInt(d2)).toString())
        let P1 = cp
        let P2 = dp
        // let x1, x2, x1t
        let result = await optimizer.optimizalQuantityUniswapV2toWeth(R1, R2, P1, P2, lb, d1, d2)
        let inputAmount = result[0]
        let debtAmount = result[1]
        let collateralAmount = result[2]
        let outputAmount = result[2]
        let profit = outputAmount.sub(inputAmount)
        if (inputAmount.lt(ether.mul(5).div(10))){
            return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
        }
        else if (collateralAmount.lt(maxToLiquidate)){

            return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
        }
        else{
            // x1, x2
            let result = await optimizer.calcOptimizalQuantityUniswapV2toWeth(R1, R2, P1, P2, lb, d1, d2, maxToLiquidate)
            inputAmount = result[0]
            debtAmount = result[1]
            collateralAmount = maxToLiquidate
            outputAmount = maxToLiquidate
            profit = outputAmount.sub(inputAmount)

            if (inputAmount.lt(ether.mul(5).div(10))){
                return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
            }
            else{
                return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
            }
        }
    }
    else{
        let debtToken0 = pairInformation[0][0]
        let collateralToken0 = pairInformation[0][1]
        let R1 = BN.from(debtToken0 == addresses[env]['weth'] ? pairInformation[2][0] : pairInformation[3][0])
        let R2 = BN.from(debtToken0 == addresses[env]['weth'] ? pairInformation[3][0] : pairInformation[2][0])
        let R1t = BN.from(collateralToken0 == addresses[env]['weth'] ? pairInformation[2][1] : pairInformation[3][1])
        let R3 = BN.from(collateralToken0 == addresses[env]['weth'] ? pairInformation[3][1] : pairInformation[2][1])
        let d1 = debtToken0 == addresses[env]['weth'] ? pairInformation[4][0] : pairInformation[5][0]
        let d2 = debtToken0 == addresses[env]['weth'] ? pairInformation[5][0] : pairInformation[4][0]
        let d3 = collateralToken0 == addresses[env]['weth'] ? pairInformation[5][1] : pairInformation[4][1]
        d1 = BN.from((10** parseInt(d1)).toString())
        d2 = BN.from((10** parseInt(d2)).toString())
        d3 = BN.from((10** parseInt(d3)).toString())
        let P2 = dp
        let P3 = cp
        // let x1, x2, x3, x1t 
        let result = await optimizer.optimizalQuantityUniswapV2toUniswapV2(R1, R2, R3, R1t, P2, P3, lb, d2, d3)
        let inputAmount = result[0]
        let debtAmount = result[1]
        let collateralAmount = result[2]
        let outputAmount = result[3]
        let profit = outputAmount.sub(inputAmount)

        
        if (inputAmount.lt(ether.mul(3).div(10))){
            return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
        }
        else if (collateralAmount.lt(maxToLiquidate)){
            return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
        }
        else{
            // x1t, x2, x1
            result = await optimizer.calcOptimizalQuantityUniswapV2toUniswapV2(R1, R2, R3, R1t, P2, P3, lb, d2, d3, maxToLiquidate)
            inputAmount = result[2]
            debtAmount = result[1]
            collateralAmount = maxToLiquidate
            outputAmount = result[0]
            profit = outputAmount.sub(inputAmount)

            if (inputAmount.lt(ether.mul(3).div(10))){
                return [BN.from(0), BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
            }
            else{
                return [inputAmount, debtAmount, collateralAmount, profit, outputAmount]
            }


        }
    }


}

init()












