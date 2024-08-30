var Web3 = require('web3')
var fs = require('fs')
var math = require('math.js')
var aaveLenderV2Abi = require('../src/utils/aaveLenderV2ABI')
var xlsx = require('node-xlsx')


(async() =>{

    const web3 = new Web3(new Web3.providers.WebsocketProvider('wss://eth-mainnet.g.alchemy.com/v2/'))

    // 监听aave合约的新borrow活动
    const aaveLenderV2 = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9'

    var aaveInstance= new web3.eth.Contract(aaveLenderV2Abi['AAVE_LENDER_ABI'], aaveLenderV2)

    let startBlock = 11362579
    // let startBlock = 16400000
    let latestBlock = 16409883
    let step = 1000
    let fromBlock
    let endBlock
    let asset

    let loopNum = math.round((latestBlock - startBlock) / step + 0.5)

    let borrower1 = []
    for (i = 0; i < loopNum; i++){

        fromBlock = startBlock + i * step
        if (fromBlock + step < latestBlock){
            endBlock = fromBlock + step
        }
        else{
            endBlock = latestBlock
        }
        let options = {
            filter: {
                    //Only get events where transfer value was 1000 or 1337
            },
            fromBlock: fromBlock,                  //Number || "earliest" || "pending" || "latest"
            toBlock: endBlock
        };
    
        console.log(options['toBlock'])
        await aaveInstance.getPastEvents('Borrow', options)
            .then(results => {
                
                for (k = 0; k < results.length; k++){
                    asset = results[k]['returnValues'][0]
                    borrower1.push(results[k]['returnValues']['user'])
                }
                
                if (options['toBlock'] == latestBlock){
                    if (fs.existsSync('data') == 0){
                        fs.mkdirSync('data')
                    }
                    let newArr = JSON.stringify(borrower1)
                    fs.writeFileSync('../data/borrower.json', newArr, 'utf8', (err) =>{
                        console.log('写入成功', err)
                    })
                    process.exit(1)
                }   
            })
            .catch(err => {
                console.log(err)
            })
    }
    process.exit(1)
})()







