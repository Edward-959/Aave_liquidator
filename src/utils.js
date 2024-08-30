var xlsx = require('node-xlsx')

module.exports = 
{
    async xlsxReading(fileName, i){
        const sheet = xlsx.parse(fileName)[i]
        let addressList = []
        for(var rowId in sheet['data']){
            var row=sheet['data'][rowId];
            addressList.push(row[0]);
        }
        return addressList
    },

    async xlsxWriting(name, list, keys){
        let newSheets = []
        let user
        let transactionHash
        for (i = 0; i < keys.length; i++){
            newSheets.push({
                name: keys[i].substring(0, 10), 
                data: []
            })
            if (list[keys[i]]['user'].length > 0){
                for(j = 0; j < list[keys[i]]['user'].length; j++){
                    user = list[keys[i]]['user'][j.toString()]
                    transactionHash = list[keys[i]]['transactionHash'][j.toString()]
                    newSheets[i].data.push([user, transactionHash])
                }
            }
    
        }
        let buffer = xlsx.build(newSheets)
        fs.writeFileSync(name, buffer, 'binary')
    
    },

    async removeValue(array, val) {
        for (var i = 0; i < array.length; i++) {
          if (array[i] === val) {
            array.splice(i, 1);
            i--;
          }
        }
        return array;
      },
    
    async inArray(search, array){
        for (var i in array){
            if (array[i] == search){
                return true
            }
        }
        return false
    }
    
}
