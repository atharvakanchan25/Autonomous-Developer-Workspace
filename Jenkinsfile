pipeline {
    agent any

    environment {
        COMPOSE_FILE = 'docker-compose.yml'
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
                sh 'docker build --network=host -t adw-backend ./apps/server-py'
            }
        }

        stage('Build Frontend') {
            steps {
                echo '⚛️ Building frontend Docker image...'
                sh 'docker build --network=host -t adw-frontend ./apps/web'
            }
        }

        stage('Stop Old Containers') {
            steps {
                echo '🛑 Stopping old containers...'
                sh 'docker rm -f adw-backend adw-frontend || true'
            }
        }

        stage('Deploy') {
            steps {
                echo '🚀 Starting containers...'
                sh 'docker-compose up -d --build'
            }
        }

        stage('Health Check') {
            steps {
                echo '❤️ Checking backend health...'
                sleep(time: 10, unit: 'SECONDS')
                sh 'docker exec adw-backend curl -f http://localhost:4000/health || exit 1'
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
            sh 'docker-compose logs --tail=50 || true'
        }
    }
}
