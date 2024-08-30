//SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

library UniswapV2Library {
    using SafeMath for uint;

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut) internal pure returns (uint amountOut) {
        require(amountIn > 0, 'UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        require(reserveIn > 0 && reserveOut > 0, 'UniswapV2Library: INSUFFICIENT_LIQUIDITY');
        uint amountInWithFee = amountIn.mul(997);
        uint numerator = amountInWithFee.mul(reserveOut);
        uint denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = numerator / denominator;
    }

}


library SafeMath {

    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }


    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        uint256 c = a - b;

        return c;
    }


    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
        // benefit is lost if 'b' is also tested.
        // See: https://github.com/OpenZeppelin/openzeppelin-solidity/pull/522
        if (a == 0) {
            return 0;
        }

        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");

        return c;
    }


    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, "SafeMath: division by zero");
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }


    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, "SafeMath: modulo by zero");
        return a % b;
    }
}

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

}

interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IVault{
    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

interface ILendingPoolDataProvider{
    struct TokenData {
        string symbol;
        address tokenAddress;
    }
    function getAllReservesTokens() external view returns (TokenData[] memory);
}

interface ILendingPool {
  function liquidationCall
    ( address _collateral, 
      address _reserve, 
      address _user, 
      uint256 _purchaseAmount, 
      bool _receiveAToken ) external payable;
}

interface IWETH9{
    function withdraw(uint) external ;
}

interface ITether{
    function approve(address _spender, uint _value) external;
}



contract FlashloanAndLiquidate{

    using SafeMath for uint256;
    
    address private owner;
    address private zeroAddress = 0x0000000000000000000000000000000000000000;
    address private weth = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    IVault private constant vault = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    ILendingPool private constant lendingPool = ILendingPool(0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9);

    event success(address);

    constructor() public payable{
        owner = msg.sender;
        ILendingPoolDataProvider.TokenData[] memory tokenData = 
            ILendingPoolDataProvider(0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d).getAllReservesTokens();
        ITether(0xdAC17F958D2ee523a2206206994597C13D831ec7).approve(address(lendingPool), 1e50);
        for (uint i = 1; i < tokenData.length; i ++){
            IERC20(tokenData[i].tokenAddress).approve(address(lendingPool), uint256(-1));
        }

    }

    receive() external payable{}

    function startFlashloan(address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external payable{
        require(msg.sender == owner, "not me");
        IERC20[] memory ierc20Tokens = new IERC20[](tokens.length);
        for(uint i = 0; i < tokens.length; i++){
            ierc20Tokens[i] = IERC20(tokens[i]);
        }
        vault.flashLoan(IFlashLoanRecipient(address(this)), ierc20Tokens, amounts, userData);
        IWETH9(weth).withdraw(IERC20(weth).balanceOf(address(this)));
        block.coinbase.transfer(address(this).balance.mul(5).div(10));
        owner.transfer(address(this).balance);
    }

    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external{
        require(msg.sender == address(vault), "Wrong msg.sender");
        executeFlashloan(userData, amounts, tokens);
        tokens[0].transfer(address(vault), amounts[0] + feeAmounts[0]);
    }

    function executeFlashloan(bytes calldata userData, uint256[] calldata amounts, IERC20[] calldata tokens) internal{
        (uint256 debtAmount, address debtPool, address collateralPool, address debt, address collateral, address user, uint256 outputAmount) 
        = abi.decode(userData, (uint256, address, address, address, address, address, uint256));
        if (debtPool == zeroAddress){

            myLiquidationFunction(collateral, debt, user, debtAmount, false);

            uint256 collateralAmount = IERC20(collateral).balanceOf(address(this));
            IERC20(collateral).transfer(collateralPool, collateralAmount);
            IUniswapV2Pair(collateralPool).swap(collateral < weth ? 0 : outputAmount, collateral < weth ? outputAmount : 0, address(this), "");
        }
        else if (collateralPool == zeroAddress){
            uint256 inputAmount = amounts[0];
            tokens[0].transfer(debtPool, inputAmount);
            IUniswapV2Pair(debtPool).swap(debt < weth ? debtAmount : 0, debt < weth ? 0 : debtAmount, address(this), "");

            myLiquidationFunction(collateral, debt, user, debtAmount, false);
        }
        else {
            uint256 inputAmount = amounts[0];
            tokens[0].transfer(debtPool, inputAmount);
            IUniswapV2Pair(debtPool).swap(debt < weth ? debtAmount : 0, debt < weth ? 0 : debtAmount, address(this), "");

            myLiquidationFunction(collateral, debt, user, debtAmount, false);

            uint256 collateralAmount = IERC20(collateral).balanceOf(address(this));
            IERC20(collateral).transfer(collateralPool, collateralAmount);
            IUniswapV2Pair(collateralPool).swap(collateral < weth ? 0 : outputAmount, collateral < weth ? outputAmount : 0, address(this), "");
        }
        emit success(debtPool);
    }


    function myLiquidationFunction(
        address _collateral, 
        address _reserve,
        address _user,
        uint256 _purchaseAmount,
        bool _receiveaToken
    )
        internal
    {
        require(IERC20(_reserve).approve(address(lendingPool), _purchaseAmount), "Approval error");
        // Assumes this contract already has `_purchaseAmount` of `_reserve`.
        lendingPool.liquidationCall(_collateral, _reserve, _user, _purchaseAmount, _receiveaToken);
    }

    function selfDistruct() external{
        if (msg.sender == owner){
            selfdestruct(address(this));
        }
    }
      
}
