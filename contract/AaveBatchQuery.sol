//SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

/**
 * @dev Wrappers over Solidity's arithmetic operations with added overflow
 * checks.
 *
 * Arithmetic operations in Solidity wrap on overflow. This can easily result
 * in bugs, because programmers usually assume that an overflow raises an
 * error, which is the standard behavior in high level programming languages.
 * `SafeMath` restores this intuition by reverting the transaction when an
 * operation overflows.
 *
 * Using this library instead of the unchecked operations eliminates an entire
 * class of bugs, so it's recommended to use it always.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");

        return c;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        uint256 c = a - b;

        return c;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     * - Multiplication cannot overflow.
     */
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

    /**
     * @dev Returns the integer division of two unsigned integers. Reverts on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        // Solidity only automatically asserts when dividing by 0
        require(b > 0, "SafeMath: division by zero");
        uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold

        return c;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * Reverts when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, "SafeMath: modulo by zero");
        return a % b;
    }
}

interface ILendingPool{

    using SafeMath for uint256;

    function getUserAccountData(address user)
        external
        view
        returns (
        uint256 totalCollateralETH,
        uint256 totalDebtETH,
        uint256 availableBorrowsETH,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    );
}

interface IDataProvider{
    function getUserReserveData(address asset, address user)
        external
        view
        returns (
        uint256 currentATokenBalance,
        uint256 currentStableDebt,
        uint256 currentVariableDebt,
        uint256 principalStableDebt,
        uint256 scaledVariableDebt,
        uint256 stableBorrowRate,
        uint256 liquidityRate,
        uint40 stableRateLastUpdated,
        bool usageAsCollateralEnabled
        );

    function getReserveConfigurationData(address asset)
        external
        view
        returns (
        uint256 decimals,
        uint256 ltv,
        uint256 liquidationThreshold,
        uint256 liquidationBonus,
        uint256 reserveFactor,
        bool usageAsCollateralEnabled,
        bool borrowingEnabled,
        bool stableBorrowRateEnabled,
        bool isActive,
        bool isFrozen
        );
    }

interface IUniswapV2Factory {
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);
}

interface IUniswapV2Pair{
    function token0() external view returns(address);
    function token1() external view returns(address);
    function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast);
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

contract AaveBatchQuery{

    using SafeMath for uint256;

    function batchQueryUserHealth(address[] calldata _addresses, address _lendingPool) external view returns(uint256[] memory, uint256[] memory){
        uint256[] memory healthFactorList = new uint256[](_addresses.length);
        uint256[] memory totalDebt = new uint256[](_addresses.length);
        uint256 debt;
        uint256 health;

        for (uint i = 0; i < _addresses.length; i++){
            (, debt, , , , health) = ILendingPool(_lendingPool).getUserAccountData(_addresses[i]);
            totalDebt[i] = debt;
            healthFactorList[i] = health;
        }
        return (healthFactorList, totalDebt);
    }

    function batchQueryUserReserves(address[] calldata _addresses, address[] calldata _user, address _dataProvider) external view returns(uint256[] memory, uint256[] memory){
        uint256[] memory debtList = new uint256[](_addresses.length * _user.length);
        uint256[] memory aTokenList = new uint256[](_addresses.length * _user.length);
        uint256 stableDebt;
        uint256 variableDebt;
        uint256 aToken;
        for (uint i = 0; i < _user.length; i++){
            for (uint j = 0; j < _addresses.length; j++){
                (aToken, stableDebt, variableDebt, , , , , , ) = IDataProvider(_dataProvider).getUserReserveData(_addresses[j], _user[i]);
                debtList[j + i * _addresses.length] = stableDebt.add(variableDebt);
                aTokenList[j + i * _addresses.length] = aToken;
            }
        }

        return (debtList, aTokenList);
    }

    function batchQueryReservesConfiguration(address[] calldata _asset, address _dataProvider) external view returns(uint256[] memory, bool[] memory, uint8[] memory){
        uint256[] memory liquidationBonusList = new uint256[](_asset.length);
        uint8[] memory decimalsList = new uint8[](_asset.length);
        bool[] memory usageAsCollateralEnabledList = new bool[](_asset.length);
        uint256 liquidationBonus;
        uint8 decimals;
        bool usage;
        for (uint256 i = 0; i < _asset.length; i++){
            ( , , , liquidationBonus, , usage, , , , ) = IDataProvider(_dataProvider).getReserveConfigurationData(_asset[i]);
            liquidationBonusList[i] = liquidationBonus;
            usageAsCollateralEnabledList[i] = usage;
            decimals = IERC20(_asset[i]).decimals();
            decimalsList[i] = decimals;
        }

        return(liquidationBonusList, usageAsCollateralEnabledList, decimalsList);
    }

    function uniswapV2PoolBatchQuery(address factoryAddress, uint256 startPair, uint256 endPair) external view returns(address[] memory){
        address[] memory addressList = new address[](endPair - startPair + 1);
        for (uint i = startPair; i <= endPair; i++){
            addressList[i - startPair] = IUniswapV2Factory(factoryAddress).allPairs(i);
        }
        return addressList;
    }

    function uniswapV2PairsBatchQuery(address[] calldata pairList) external view returns(address[] memory, address[] memory, uint112[] memory, uint112[]memory, uint8[] memory, uint8[]memory){
        address[] memory token0List = new address[](pairList.length);
        address[] memory token1List = new address[](pairList.length);
        uint112[] memory reserve0List = new uint112[](pairList.length);
        uint112[] memory reserve1List = new uint112[](pairList.length);
        uint8[] memory decimals0List = new uint8[](pairList.length);
        uint8[] memory decimals1List = new uint8[](pairList.length);
        for (uint i = 0; i < pairList.length; i++){
            token0List[i] = IUniswapV2Pair(pairList[i]).token0();
            token1List[i] = IUniswapV2Pair(pairList[i]).token1();
            (reserve0List[i], reserve1List[i], ) = IUniswapV2Pair(pairList[i]).getReserves();
            decimals0List[i] = IERC20(token0List[i]).decimals();
            decimals1List[i] = IERC20(token1List[i]).decimals();
        }
        return(token0List, token1List, reserve0List, reserve1List, decimals0List, decimals1List);
    }
}