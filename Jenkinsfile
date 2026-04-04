pipeline {
    agent any

    environment {
        COMPOSE_FILE = 'docker-compose.yml'
        BACKEND_URL  = 'http://adw-backend:4000/health'
    }

    stages {

        stage('Checkout') {
            steps {
                echo '📥 Checking out source code...'
                checkout scm
            }
        }

        stage('Build Backend') {
            steps {
                echo '🐍 Building backend Docker image...'
                bat 'docker build -t adw-backend ./apps/server-py'
            }
        }

        stage('Build Frontend') {
            steps {
                echo '⚛️ Building frontend Docker image...'
                bat 'docker build -t adw-frontend ./apps/web'
            }
        }

        stage('Stop Old Containers') {
            steps {
                echo '🛑 Stopping old containers...'
                bat 'docker rm -f adw-backend adw-frontend || exit 0'
            }
        }

        stage('Deploy') {
            steps {
                echo '🚀 Starting containers...'
                bat 'docker-compose up -d --build'
            }
        }

        stage('Health Check') {
            steps {
                echo '❤️ Checking backend health...'
                sleep(time: 10, unit: 'SECONDS')
                bat 'docker exec adw-backend curl -f http://localhost:4000/health || exit 1'
            }
        }
    }

    post {
        success {
            echo '✅ ADW deployed successfully!'
            echo '🌐 Frontend: http://localhost:3000'
            echo '🔧 Backend:  http://localhost:4000'
        }
        failure {
            echo '❌ Deployment failed! Check logs above.'
            bat 'docker-compose logs --tail=50'
        }
    }
}
