var Web3 = require('web3');
var ethers = require('ethers');
var aaveLenderV2Abi = require('../src/utils/aaveLenderV2ABI');
var reserveList = require('../src/utils/aave_reserve_list');
var providers = require('../src/utils/provider');
var addresses = require('../src/utils/addresses');
var math = require('math.js');
var fs = require('fs');
var exampleData = require('../src/utils/pairExample')

function removeValue(array, val) {
    for (var i = 0; i < array.length; i++) {
      if (array[i] === val) {
        array.splice(i, 1);
        i--;
      }
    }
    return array;
  }

function inArray(search, array){
    for (var i in array){
        if (array[i] == search){
            return true
        }
    }
    return false
}

async function getPairList(){
    env = 'mainnet'
    const web3 = new Web3(new Web3.providers.WebsocketProvider(providers[env]))
    const batchQueryAbi = aaveLenderV2Abi['BATCH_QUERY']
    const factoryAbi = aaveLenderV2Abi['UNISWAP_V2_FACTORY']
    const batchQueryAddress = addresses[env]['aaveBatchQueryAddress']
    const uniswapV2FactoryAddress = addresses[env]['uniswapV2Factory']
    const sushiswapV2FactoryAddress = addresses[env]['sushiswapV2Factory']
    

    let uniswapFactory = new web3.eth.Contract(factoryAbi, uniswapV2FactoryAddress)
    let sushiswapFactory = new web3.eth.Contract(factoryAbi, sushiswapV2FactoryAddress)
    let batchQuery = new web3.eth.Contract(batchQueryAbi, batchQueryAddress)

    let uniPairLength = await uniswapFactory.methods.allPairsLength().call()
    let sushiPairLength = await sushiswapFactory.methods.allPairsLength().call()

    let uniswapPairList = []
    let sushiswapPairList = [] 
    
    let step = 3000
    let loopNum = math.round(uniPairLength / step + 0.5)
    for(let i = 0; i < loopNum; i++){
        let loopStart = i * step
        let loopEnd = (i + 1) * step - 1 <= uniPairLength - 1 ? ((i + 1)  * step) - 1: uniPairLength - 1
        let tempList = await batchQuery.methods.uniswapV2PoolBatchQuery(uniswapV2FactoryAddress, loopStart, loopEnd).call()
        uniswapPairList = uniswapPairList.concat(tempList)
        console.log(i)
    }

    sushiswapPairList = await batchQuery.methods.uniswapV2PoolBatchQuery(sushiswapV2FactoryAddress, 0, sushiPairLength - 1).call()
    let newArr = JSON.stringify(uniswapPairList)
    fs.writeFileSync('uniswapPairList.json', newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })
    let newArr1 = JSON.stringify(sushiswapPairList)
    fs.writeFileSync('sushiswapPairList.json', newArr1, 'utf8', (err) =>{
        console.log('写入成功', err)
    })
    process.exit(1)
}

function getPairDict(){   
    env = 'mainnet'
    let uniswapPairList
    let sushiswapPairList
    uniswapPairList = JSON.parse(fs.readFileSync('./data/uniswapPairList.json', 'utf8'))
    sushiswapPairList = JSON.parse(fs.readFileSync('./data/sushiswapPairList.json', 'utf8'))
    const batchQueryAbi = aaveLenderV2Abi['BATCH_QUERY']
    // const batchQueryAddress = addresses[env]['aaveBatchQueryAddress']
    // const web3 = new Web3(new Web3.providers.WebsocketProvider(providers[env]))
    const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'))


    let token0List = exampleData.token0List
    let token1List = exampleData.token1List
    let reserve0List = exampleData.reserve0List
    let reserve1List = exampleData.reserve1List
    let decimals0List = exampleData.decimals0List
    let decimals1List = exampleData.decimals1List
    reserveList = reserveList.reserveList['mainnet']
    let reservePair = {}
    reserveList = removeValue(reserveList, addresses[env]['weth'])
    console.log(inArray(addresses[env]['weth'], reserveList))
    for (let i = 0; i < reserveList.length; i++){
        reservePair[reserveList[i]] = {}
        reservePair[reserveList[i]]['weth'] = {}
    }
    for (let i = 0; i < uniswapPairList.length; i++){
        if (inArray(token0List[i], reserveList) || inArray(token1List[i], reserveList)){
            let tag = inArray(token0List[i], reserveList) ? token0List[i] : token1List[i]
            if (token0List[i] == addresses[env]['weth'] || token1List[i] == addresses[env]['weth']){
                reservePair[tag]['weth'][uniswapPairList[i]] = {}
                reservePair[tag]['weth'][uniswapPairList[i]]['token0'] = token0List[i]
                reservePair[tag]['weth'][uniswapPairList[i]]['token1'] = token1List[i]
                reservePair[tag]['weth'][uniswapPairList[i]]['decimals0'] = decimals0List[i]
                reservePair[tag]['weth'][uniswapPairList[i]]['decimals1'] = decimals1List[i]
            }
            else{
                reservePair[tag][uniswapPairList[i]] = {}
                reservePair[tag][uniswapPairList[i]]['token0'] = token0List[i]
                reservePair[tag][uniswapPairList[i]]['token1'] = token1List[i]
                reservePair[tag][uniswapPairList[i]]['decimals0'] = decimals0List[i]
                reservePair[tag][uniswapPairList[i]]['decimals1'] = decimals1List[i]
            }
        }
    }
    console.log(reservePair)
    let newArr = JSON.stringify(reservePair)
    fs.writeFileSync('pairArray.json', newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })

    // let result= await batchQuery.methods.uniswapV2PairsBatchQuery(uniswapPairList.slice(0, 1000)).call()
    // let token0List = result[0]
    // let token1List = result[1]
    // let reserve0List = result[2]
    // let reserve1List = result[3]
    // let decimals0List = result[4]
    // let decimals1List = result[5]

}

async function getWETHUniswapPairDict() {
    let env = 'mainnet'
    reserveList = reserveList.reserveList['mainnet']
    let reservePair = {}
    const web3 = new Web3(new Web3.providers.WebsocketProvider(providers[env]))
    const uniswapV2FactoryAddress = addresses[env]['uniswapV2Factory']
    const factoryAbi = aaveLenderV2Abi['UNISWAP_V2_FACTORY']
    let uniswapFactory = new web3.eth.Contract(factoryAbi, uniswapV2FactoryAddress)
    for (let i = 0; i < reserveList.length; i++){
        reservePair[reserveList[i]] = {}
        reservePair[reserveList[i]]['weth'] = {}
    }
    for (let i = 0; i < reserveList.length; i ++){
        console.log(i)
        let wethPair = await uniswapFactory.methods.getPair(reserveList[i], addresses[env]['weth']).call()
        reservePair[reserveList[i]]['weth'] = wethPair
    }
    console.log(reservePair)
    let newArr = JSON.stringify(reservePair)
    fs.writeFileSync('pairArray.json', newArr, 'utf8', (err) =>{
        console.log('写入成功', err)
    })


}

(async()=>{
    await getWETHUniswapPairDict()
})()