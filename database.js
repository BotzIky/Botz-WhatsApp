const fs = require('fs').promises;
const path = require('path');

class Database {
    constructor(filename) {
        this.filepath = path.join(__dirname, filename);
        this.data = null;
    }

    async load() {
        try {
            const rawData = await fs.readFile(this.filepath, 'utf8');
            this.data = JSON.parse(rawData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.data = {};
                await this.save();
            } else {
                throw error;
            }
        }
    }

    async save() {
        await fs.writeFile(this.filepath, JSON.stringify(this.data, null, 2));
    }

    async get(key) {
        if (!this.data) await this.load();
        return this.data[key];
    }

    async set(key, value) {
        if (!this.data) await this.load();
        this.data[key] = value;
        await this.save();
    }

    async update(key, updateFunction) {
        if (!this.data) await this.load();
        if (this.data[key]) {
            this.data[key] = updateFunction(this.data[key]);
            await this.save();
        }
    }

    async findOne(query) {
        if (!this.data) await this.load();
        return Object.values(this.data).find(item => 
            Object.entries(query).every(([key, value]) => item[key] === value)
        );
    }

    async insertOne(document) {
        if (!this.data) await this.load();
        const id = Date.now().toString();
        this.data[id] = { ...document, _id: id };
        await this.save();
        return { insertedId: id };
    }

    async updateOne(query, update) {
        if (!this.data) await this.load();
        const item = await this.findOne(query);
        if (item) {
            Object.assign(item, update.$set);
            await this.save();
            return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
    }
}

module.exports = Database;