var Web3 = require('web3');
var fs = require('fs');
var aaveLenderV2Abi = require('../src/utils/aaveLenderV2ABI');
var ethers = require('ethers');
var math = require('math.js');


(async()=>{
    // protocolDataProvider: 

    const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://eth-mainnet.g.alchemy.com/v2/'))
    // 监听aave合约的新borrow活动
    const aaveLenderV2 = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'
    const aaveBatchQuery = ''
    var aaveInstance= new web3.eth.Contract(aaveLenderV2Abi['AAVE_LENDER_ABI'], aaveLenderV2)
    let batchQuery = new web3.eth.Contract(aaveLenderV2Abi['BATCH_QUERY'], aaveBatchQuery)
    let addressListTotal = []
    let filteredBorrwer = []

    // addressListTotal = xlsxReading('../tokenBorrower/filteredBorrower.xlsx', 0)
    addressListTotal = JSON.parse(fs.readFileSync('./data/borrower.json', 'utf8'))
    addressListTotal = [...new Set(addressListTotal)]
    let liquidationThre = ethers.BigNumber.from('10000000000000000000')
    let healthThreHigh = ethers.BigNumber.from('2000000000000000000')
    let healthThreLow = ethers.BigNumber.from('1000000000000000000')
    let start
    let end
    let healthList = []
    let liquidationList = [] 
    let step = 2000
    let loopNum = math.round(addressListTotal.length / step + 0.5)
    for (let k = 0; k < loopNum; k ++){
        if ((k + 1) * step > addressListTotal.length){
            start = k * step
            end = addressListTotal.length
        }
        else{
            start = k * step
            end = (k + 1) * step 
        }
        console.log(k.toString() + '/' + (loopNum - 1).toString())
        let result = await batchQuery.methods.batchQueryUserHealth(addressListTotal.slice(start, end), aaveLenderV2).call()
        healthList = healthList.concat(result[0])
        liquidationList = liquidationList.concat(result[1])
    }
    for (let j = 0; j < addressListTotal.length; j++){
        
        if (ethers.BigNumber.from(liquidationList[j]).gte(liquidationThre) 
            && ethers.BigNumber.from(healthList[j]).lte(healthThreHigh)
            && ethers.BigNumber.from(healthList[j]).gte(healthThreLow)){
            filteredBorrwer.push(addressListTotal[j])
        }
    }
    
    let newArr = JSON.stringify(filteredBorrwer)
    fs.writeFileSync('./data/filteredBorrowerBig.json', newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })

    process.exit(1)

})()


