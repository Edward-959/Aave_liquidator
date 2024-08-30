var BN = require('ethers').BigNumber
var bn = require('bignumber.js')


// 以2022年11月22日的crv被清算为例
// 清算路径为weth-crv-usdc-weth
// 假设闪电贷weth作为初始, 借入数量为x, 在闪电贷结束后输出数量为x'
// 根据weth-crv, crv-usdc, usdc-weth的reserve求 max(x' - x)
// 其中weth-crv 的reserve为R1, R2, usdc-weth为R3, R1'
// crv-usdc的数额可以根据crvPrice, usdcPrice, 和liquidationBonus来计算，记为P2, P3, lb
// 整个函数包含未知数7个

module.exports = {

    async optimizalQuantityUniswapV2toUniswapV2(R1, R2, R3, R1t, P2, P3, lb, d2, d3){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P2).mul(lb).mul(d3).div(P3).div(d2).div(BN.from(10000))
        let a = R1t.mul(K).mul(R2).mul(r).mul(r).div(ether).div(ether).div(ether)
        let b = R3.mul(R1)
        let c = (K.mul(R2).mul(r).mul(r).div(ether).div(ether).div(ether)).add(R3.mul(r).div(ether))
        if (a.gt(b)){
            let ab = a.mul(b)
            let sqrtab = sqrt(ab)
            let x1 = (sqrtab.sub(b)).div(c)

            let x2 = (x1.mul(R2).mul(r).div(ether)).div(R1.add((x1.mul(r).div(ether))))
            let x3 = x2.mul(K).div(ether)
            let x1t = a.mul(x1).div((c.mul(x1)).add(b))

            return [x1, x2, x3, x1t]
        }
        else{
            return [BN.from(0), BN.from(0), BN.from(0), BN.from(0)]
        }
    },
    
    async optimizalQuantityWethtoUniswapV2(R1t, R2, P1, P2, lb, d1, d2){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P1).mul(lb).div(P2).mul(d2).div(d1).div(BN.from(10000))
        let a = R1t.mul(r).mul(K).div(ether).div(ether)
        let b = R2
        let c = r.mul(K).div(ether)
        if (a.gt(b)){
            let ab = a.mul(b)
            let sqrtab = sqrt(ab)
            let x1 = (sqrtab.sub(b)).mul(ether).div(c)

            let x2 = x1.mul(K).div(ether)
            let cx1 = x1.mul(r).mul(K).div(ether).div(ether)
            let x1t = a.mul(x1).div(cx1.add(b))
            return [x1, x2, x1t]
        }
        else{
            return [BN.from(0), BN.from(0), BN.from(0)]
        }
    },
    
    async optimizalQuantityUniswapV2toWeth(R1, R2, P1, P2, lb, d1, d2){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P2).mul(lb).div(P1).mul(d1).div(d2).div(BN.from(10000))
        let a = K.mul(R2).mul(r).div(ether).div(ether)
        let b = R1
        let c = r
        if (a.gt(b)){
            let ab = a.mul(b)
            let sqrtab = sqrt(ab)
            let x1 = (sqrtab.sub(b)).mul(ether).div(c)
            
            let x2 = x1.mul(R2).mul(r).div((R1.mul(ether)).add(x1.mul(r)))
            let cx1 = r.mul(x1).div(ether)
            let x1t = a.mul(x1).div(cx1.add(b))
            return [x1, x2, x1t]
        }
        else{
            return [BN.from(0), BN.from(0), BN.from(0)]
        }
    },

    async calcOptimizalQuantityUniswapV2toUniswapV2(R1, R2, R3, R1t, P2, P3, lb, d2, d3, x3){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P2).mul(lb).mul(d3).div(P3).div(d2).div(BN.from(10000))
        let a = R1t.mul(K).mul(R2).mul(r).mul(r).div(ether).div(ether).div(ether)
        let b = R3.mul(R1)
        let c = (K.mul(R2).mul(r).mul(r).div(ether).div(ether).div(ether)).add(R3.mul(r).div(ether))
        
        let x1t = (R1t.mul(x3).mul(r).div(ether)).div((R3).add(r.mul(x3).div(ether)))
        let x2 = x3.mul(ether).div(K)
        let x1 = (R1.mul(x2)).div(r.mul(R2.sub(x2)).div(ether))
        // let x1 = b.mul(x1t).mul(ether).div(a.mul(ether).sub(c.mul(x1t)))
        // let x2 = (x1.mul(R2).mul(r).div(ether)).div(R1.add((x1.mul(r).div(ether))))
        return [x1t, x2, x1]
    },
    

    async calcOptimizalQuantityWethtoUniswapV2(R1t, R2, P1, P2, lb, d1, d2, x2){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P1).mul(lb).div(P2).mul(d2).div(d1).div(BN.from(10000))
        let a = R1t.mul(r).mul(K).div(ether).div(ether)
        let b = R2
        let x1 = x2.mul(ether).div(K)
        let cx1 = x1.mul(r).mul(K).div(ether).div(ether)
        let x1t = a.mul(x1).div(cx1.add(b))
        return [x1t, x1]

    },
    

    async calcOptimizalQuantityUniswapV2toWeth(R1, R2, P1, P2, lb, d1, d2, x1t){
        let ether = BN.from('1000000000000000000')
        let r = ether.div(BN.from(1000)).mul(BN.from(997))
        let K = ether.mul(P2).mul(lb).div(P1).mul(d1).div(d2).div(BN.from(10000))
        let a = K.mul(R2).mul(r).div(ether).div(ether)
        let c = r
        let b = R1
        let x1 = b.mul(x1t).mul(ether).div(a.mul(ether).sub(c.mul(x1t)))
        let x2 = x1.mul(R2).mul(r).div((R1.mul(ether)).add(x1.mul(r)))
        // let cx1 = r.mul(x1).div(ether)
        // let x1t = a.mul(x1).div(cx1.add(b))
        return [x1, x2]
    }    

}

function sqrt(value){
    return BN.from(new bn(value.toString()).sqrt().toFixed().split('.')[0])
  }


 